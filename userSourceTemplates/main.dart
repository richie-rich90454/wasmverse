import 'dart:io';
void main() {
  print('=== Hello from the Universal WASM Platform ===');
  stdout.write('Your name? ');
  final name = stdin.readLineSync() ?? '';
  print('Hello, $name!');
}
