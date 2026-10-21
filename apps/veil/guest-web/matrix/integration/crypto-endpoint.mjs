// Staging adapter over the standalone SDK's documented public API only.
// Application signing, enrollment, durable outbox and policy belong to callers.
import {
  initAsync, OlmMachine, UserId, DeviceId, DeviceLists, RequestType,
  LocalTrust, CollectStrategy, DecryptionSettings, TrustRequirement,
  DecryptedToDeviceEvent,
} from '@matrix-org/matrix-sdk-crypto-wasm';

const require = (value, message) => { if (!value) throw Error(message); };
const quiet = { debug() {}, info() {}, warn() {}, error() {} };

export class CryptoEndpoint {
  #machine; #request; #queue = Promise.resolve(); #stopped = false;
  #since = ''; #poll; #failure; #onMessage; #checkpoint; #onError;

  static async open({ userId, deviceId, request, onMessage, storeName, storePassphrase, expectedKeys, since = '', checkpoint = async () => {}, onError }) {
    await initAsync();
    const endpoint = new CryptoEndpoint();
    endpoint.#request = request;
    endpoint.#onMessage = onMessage;
    endpoint.#since = since; endpoint.#checkpoint = checkpoint; endpoint.#onError = onError;
    endpoint.#machine = await OlmMachine.initialize(new UserId(userId), new DeviceId(deviceId), storeName, storePassphrase, quiet);
    if (expectedKeys && (endpoint.keys.ed25519 !== expectedKeys.ed25519 || endpoint.keys.curve25519 !== expectedKeys.curve25519)) {
      endpoint.#machine.close(); throw Error('Encryption storage was lost. This conversation cannot be resumed.');
    }
    await endpoint.#drain();
    return endpoint;
  }

  #exclusive(operation) {
    const next = this.#queue.then(() => {
      if (this.#failure) throw this.#failure;
      require(!this.#stopped, 'Crypto endpoint closed');
      return operation();
    });
    this.#queue = next.catch(() => {});
    return next;
  }

  get keys() {
    const keys = this.#machine.identityKeys;
    try { return { ed25519: keys.ed25519.toBase64(), curve25519: keys.curve25519.toBase64() }; }
    finally { keys.free(); }
  }

  async #transmit(request) {
    const paths = {
      [RequestType.KeysUpload]: '/_matrix/client/v3/keys/upload',
      [RequestType.KeysQuery]: '/_matrix/client/v3/keys/query',
      [RequestType.KeysClaim]: '/_matrix/client/v3/keys/claim',
    };
    const path = paths[request.type];
    // No SDK verification event, room, backup, plaintext or arbitrary-send fallback.
    require(path, 'Unexpected SDK request');
    const response = await this.#request(path, 'POST', JSON.parse(request.body));
    await this.#machine.markRequestAsSent(request.id, request.type, JSON.stringify(response));
  }

  async #drain() {
    for (const request of await this.#machine.outgoingRequests()) {
      try { await this.#transmit(request); } finally { request.free(); }
    }
  }

  async #device(endpoint) {
    const query = this.#machine.queryKeysForUsers([new UserId(endpoint.user_id)]);
    try { await this.#transmit(query); } finally { query.free(); }
    const device = await this.#machine.getDevice(new UserId(endpoint.user_id), new DeviceId(endpoint.device_id), 0);
    if (!device || device.isDeleted() || device.ed25519Key?.toBase64() !== endpoint.ed25519 || device.curve25519Key?.toBase64() !== endpoint.curve25519) {
      device?.free(); throw Error('signed Matrix device key mismatch');
    }
    await device.setLocalTrust(LocalTrust.Verified);
    return device;
  }

  pin(endpoint) {
    return this.#exclusive(async () => { const device = await this.#device(endpoint); device.free(); });
  }

  encrypt(endpoint, type, content) {
    return this.#exclusive(async () => {
      const device = await this.#device(endpoint);
      try {
        const claim = await this.#machine.getMissingSessions([new UserId(endpoint.user_id)]);
        if (claim) { try { await this.#transmit(claim); } finally { claim.free(); } }
        const encrypted = await device.encryptToDeviceEvent(type, content, CollectStrategy.onlyTrustedDevices());
        return { messages: { [endpoint.user_id]: { [endpoint.device_id]: JSON.parse(encrypted) } } };
      } finally { device.free(); }
    });
  }

  async start() {
    require(!this.#poll, 'Sync already started');
    // Finish one real sync before reporting ready. No simulated delivery state.
    await this.#sync();
    this.#poll = (async () => {
      while (!this.#stopped) {
        try { await this.#sync(); }
        catch (error) {
          if (this.#stopped) break;
          if (!this.#onError) { this.#failure = error; break; }
          this.#onError(error);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    })();
  }

  async #sync() {
    const result = await this.#request('/_matrix/client/v3/sync?timeout=1000' + (this.#since ? '&since=' + encodeURIComponent(this.#since) : ''));
    if (this.#stopped) return;
    await this.#exclusive(async () => {
      const lists = result.device_lists ?? {};
      const processed = await this.#machine.receiveSyncChanges(JSON.stringify(result.to_device?.events ?? []),
        new DeviceLists((lists.changed ?? []).map(id => new UserId(id)), (lists.left ?? []).map(id => new UserId(id))),
        new Map(Object.entries(result.device_one_time_keys_count ?? {})), new Set(result.device_unused_fallback_key_types ?? []),
        new DecryptionSettings(TrustRequirement.Untrusted));
      for (const event of processed) {
        try {
          // Application receives SDK-authenticated provenance, never outer HTTP claims.
          if (!(event instanceof DecryptedToDeviceEvent)) continue;
          const info = event.encryptionInfo;
          try {
            await this.#onMessage({ message: JSON.parse(event.rawEvent), encryptionInfo: {
              senderCurve25519KeyBase64: info.senderCurve25519Key,
              senderVerified: info.isSenderVerified(), senderDevice: info.senderDevice?.toString(),
            } });
          } finally { info.free(); }
        } finally { event.free(); }
      }
      await this.#drain();
      await this.#checkpoint(result.next_batch);
      this.#since = result.next_batch;
    });
  }

  async close() {
    this.#stopped = true;
    await this.#poll;
    await this.#queue;
    this.#machine.close();
  }
}
