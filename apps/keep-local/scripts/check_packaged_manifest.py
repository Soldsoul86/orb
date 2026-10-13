"""Check the APK's merged manifest, not only the app source manifest."""
import sys
import xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
a = '{http://schemas.android.com/apk/res/android}'
allowed = {
    'android.permission.RECORD_AUDIO', 'android.permission.POST_NOTIFICATIONS',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
    'com.keep.local.next.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
}
allowed |= {'android.permission.READ_EXTERNAL_STORAGE','android.permission.READ_MEDIA_IMAGES','android.permission.READ_MEDIA_VIDEO','android.permission.READ_MEDIA_AUDIO','android.permission.READ_MEDIA_VISUAL_USER_SELECTED'}
perms = {p.get(a + 'name') for p in root.findall('uses-permission')}
assert perms <= allowed, f'Unexpected packaged permissions: {perms - allowed}'
assert root.get('package') == 'com.keep.local.next'
assert root.get(a + 'versionCode') == '4'
assert root.find('application').get(a + 'allowBackup') == 'false'
provider = next(p for p in root.find('application').findall('provider') if p.get(a + 'authorities') == 'com.keep.local.next.media')
assert provider.get(a + 'exported') == 'false'
assert provider.get(a + 'grantUriPermissions') == 'true'
assert root.find('uses-sdk').get(a + 'minSdkVersion') == '29'
assert root.find('uses-sdk').get(a + 'targetSdkVersion') == '36'
print('PASS: packaged permission allowlist, backups disabled, SDK 29–36')
