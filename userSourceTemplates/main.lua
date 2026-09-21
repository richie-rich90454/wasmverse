local function safeRead()
    local ok, value = pcall(io.read)
    if ok and value then
        return value
    end
    return ""
end
print("=== Hello from the Universal WASM Platform ===\n")
io.write("Your name? ")
name = safeRead()
print("Hello, " .. name .. "!\n")
io.write("Type anything: ")
line = safeRead()
print("You typed: " .. line .. "\n")
