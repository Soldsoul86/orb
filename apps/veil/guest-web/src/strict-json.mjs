// JSON syntax only. Reject duplicate members before any signed claims are consumed.
export function strictJson(source) {
  if (typeof source !== 'string' || source.length > 262144) throw new Error('INVALID_JSON');
  const pattern = /\s*("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[{}\[\]:,])/y;
  let offset=0;
  function next() {pattern.lastIndex=offset;const m=pattern.exec(source);if(!m)throw new Error('INVALID_JSON');offset=pattern.lastIndex;return m[1];}
  function parse(token,depth=0) {
    if(depth>24)throw new Error('INVALID_JSON');
    if(token==='{' || token==='[') {
      const object=token==='{', result=object?Object.create(null):[], end=object?'}':']';let t=next();
      if(t===end)return result;
      for(;;) {
        if(object) {
          if(!t.startsWith('"'))throw new Error('INVALID_JSON');const key=JSON.parse(t);
          if(Object.hasOwn(result,key) || next()!==':')throw new Error('INVALID_JSON');
          result[key]=parse(next(),depth+1);
        } else result.push(parse(t,depth+1));
        t=next();if(t===end)return result;if(t!==',')throw new Error('INVALID_JSON');t=next();
      }
    }
    if(/[{}\[\]:,]/.test(token[0]))throw new Error('INVALID_JSON');
    const value=JSON.parse(token);if(typeof value==='number'&&!Number.isFinite(value))throw new Error('INVALID_JSON');return value;
  }
  const result=parse(next());if(source.slice(offset).trim()!=='')throw new Error('INVALID_JSON');return result;
}
