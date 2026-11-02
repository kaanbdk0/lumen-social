"""Tell Kaan on Telegram when Lumen's newest App Store version changes review state.

Runs every 30 minutes from .github/workflows/asc-watch.yml. The last state it reported is kept as
a git tag (asc-<version>-<STATE>), so each change is announced once.
"""
import json, os, subprocess, time, urllib.error, urllib.request
import jwt

APP = "6780980937"
NOTES = {  # states worth a message; others (e.g. PREPARE_FOR_SUBMISSION) stay silent
    "WAITING_FOR_REVIEW": "📨 Lumen {v} incelemeye gönderildi, sırada bekliyor. Durum değişince yazacağım.",
    "IN_REVIEW": "🔎 Lumen {v} şu an Apple'ın incelemesinde.",
    "PENDING_DEVELOPER_RELEASE": "✅ Lumen {v} ONAYLANDI. Elle yayınlaman bekleniyor (App Store Connect → Release).",
    "PENDING_APPLE_RELEASE": "✅ Lumen {v} ONAYLANDI, Apple yayına alıyor.",
    "PROCESSING_FOR_DISTRIBUTION": "✅ Lumen {v} ONAYLANDI, mağazaya hazırlanıyor.",
    "READY_FOR_DISTRIBUTION": "🎉 Lumen {v} ONAYLANDI ve App Store'da yayında!",
    "READY_FOR_SALE": "🎉 Lumen {v} ONAYLANDI ve App Store'da yayında!",
    "REJECTED": "❌ Lumen {v} reddedildi. App Store Connect'te Resolution Center'daki mesaja bak, bana da gönder.",
    "METADATA_REJECTED": "⚠️ Lumen {v}: mağaza bilgileri (metin/görsel) reddedildi. Resolution Center'daki mesajı bana gönder.",
    "INVALID_BINARY": "❌ Lumen {v}: build geçersiz sayıldı.",
    "DEVELOPER_REJECTED": "↩️ Lumen {v} incelemeden geri çekildi.",
}

def asc(path):
    n = int(time.time())
    tok = jwt.encode({"iss": os.environ["ASC_ISSUER"], "iat": n, "exp": n + 900, "aud": "appstoreconnect-v1"},
                     os.environ["ASC_PRIVATE_KEY"], algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, headers={"Authorization": "Bearer " + tok})
    return json.load(urllib.request.urlopen(req, timeout=60))

def gh(*a):
    return subprocess.run(["gh", *a], capture_output=True, text=True)

def main():
    repo = os.environ["GITHUB_REPOSITORY"]
    v = asc(f"/v1/apps/{APP}/appStoreVersions?limit=1&fields[appStoreVersions]=versionString,appStoreState")["data"][0]["attributes"]
    ver, state = v["versionString"], v["appStoreState"]
    tag = f"asc-{ver}-{state}"
    print(ver, state)
    if state not in NOTES:
        return
    if gh("api", f"repos/{repo}/git/refs/tags/{tag}").returncode == 0:
        return                                            # already told
    text = NOTES[state].format(v=ver)
    body = json.dumps({"chat_id": os.environ["TELEGRAM_CHAT_ID"], "text": text}).encode()
    urllib.request.urlopen(urllib.request.Request(f"https://api.telegram.org/bot{os.environ['TELEGRAM_BOT_TOKEN']}/sendMessage",
                                                  data=body, headers={"Content-Type": "application/json"}), timeout=30)
    sha = gh("api", f"repos/{repo}/commits/HEAD", "-q", ".sha").stdout.strip()
    gh("api", f"repos/{repo}/git/refs", "-f", f"ref=refs/tags/{tag}", "-f", f"sha={sha}")
    print("sent:", text)

if __name__ == "__main__":
    main()
