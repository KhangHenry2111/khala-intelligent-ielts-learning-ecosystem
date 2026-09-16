import configparser
import requests
import os

CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "config.cfg"
)

config = configparser.ConfigParser()
config.read(CONFIG_PATH, encoding="utf-8")

print("Config path:", CONFIG_PATH)
print("Sections:", config.sections())

api_key = config["ai_model"]["OPENROUTER_API_KEY"]
model = config["ai_model"]["OPENROUTER_MODEL_NAME"]
base_url = config["ai_model"]["base_url"]
temperature = float(config["ai_model"].get("temperature", 0.2))

print("=" * 70)
print("OPENROUTER MINI TEST")
print("=" * 70)

print(f"Model: {model}")
print(f"URL: {base_url}")
print(f"Temperature: {temperature}")
print()

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

payload = {
    "model": model,
    "temperature": temperature,
    "messages": [
        {
            "role": "user",
            "content": "Hello! Please reply with exactly: Hello from OpenRouter!"
        }
    ]
}

print("[*] Sending request...")

try:
    response = requests.post(
        base_url,
        headers=headers,
        json=payload,
        timeout=60
    )

    print(f"HTTP Status: {response.status_code}")
    print()
    print("[*] Raw response:")
    print(response.text)

except requests.exceptions.Timeout:
    print("[ERROR] Request timed out.")

except requests.exceptions.RequestException as e:
    print(f"[ERROR] Request failed: {e}")

except Exception as e:
    print(f"[ERROR] Unexpected error: {e}")