let () =
  print_endline "=== Hello from the Universal WASM Platform ===";
  print_string "Your name? ";
  flush stdout;
  let name = read_line () in
  Printf.printf "Hello, %s!\n" name
