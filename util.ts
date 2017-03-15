declare var CryptoJS: any;

export class Util {
    static str2ab(str) {
        str = unescape(encodeURIComponent(str));
        var buf = new ArrayBuffer(str.length); // 2 bytes for each char
        var bufView = new Uint8Array(buf);
        for (var i=0, strLen=str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    }

    static getSASToken(account,key) {
        var sr = account + '.azure-devices.net';
        var se = Math.round(new Date().getTime() / 1000) + 60;
        var stringtosign = sr + '\n' + se;
        var sig = encodeUriComponentStrict(CryptoJS.HmacSHA256(stringtosign, CryptoJS.enc.Base64.parse(key)).toString(CryptoJS.enc.Base64));
        return 'SharedAccessSignature sr=' + sr + '&sig=' + sig + '&se=' + se + '&skn=' + connectionInfo.username;
    }
}