import sys
import os
from zhipuai import ZhipuAI

# Konfiguracja
# Klucz API powinien być w zmiennej środowiskowej ZHIPUAI_API_KEY
api_key = os.environ.get("ZHIPUAI_API_KEY")

if not api_key:
    # Możesz tutaj dodać ładowanie z .env jeśli potrzebujesz
    print("BŁĄD: Brak zmiennej środowiskowej ZHIPUAI_API_KEY", file=sys.stderr)
    sys.exit(1)

client = ZhipuAI(api_key=api_key)

def main():
    # Czytanie promptu z stdin (tak jak robi to | claude -p -)
    prompt = sys.stdin.read()

    if not prompt.strip():
        print("BŁĄD: Pusty prompt", file=sys.stderr)
        sys.exit(1)

    try:
        response = client.chat.completions.create(
            model="glm-4-plus",  # Najnowszy model GLM-4
            messages=[
                {"role": "user", "content": prompt}
            ],
            stream=True,
        )

        # Wyświetlanie odpowiedzi w trybie streamingu (tak jak Claude CLI)
        full_response = ""
        for chunk in response:
            content = chunk.choices[0].delta.content
            if content:
                print(content, end="", flush=True)
                full_response += content
        
        print() # Nowa linia na końcu

    except Exception as e:
        print(f"BŁĄD API GLM: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
