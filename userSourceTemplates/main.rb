puts "=== Hello from the Universal WASM Platform ==="
print "Your name? "
name = (gets || "").chomp
puts "Hello, #{name}!"
print "Type anything: "
line = (gets || "").chomp
puts "You typed: #{line.inspect}"
