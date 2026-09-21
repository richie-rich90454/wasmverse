import asyncio
async def main():
    print("=== Hello from the Universal WASM Platform ===")
    name = await async_input("Your name? ")
    print(f"Hello, {name}!")
    line = await async_input("Type anything: ")
    print(f"You typed: {line!r}")
