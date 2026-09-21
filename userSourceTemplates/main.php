<?php
echo "=== Hello from the Universal WASM Platform ===\n";
$stdin = fopen("php://stdin", "r");
echo "Your name? ";
$nameLine = fgets($stdin);
$name = $nameLine === false ? "" : trim($nameLine);
echo "Hello, {$name}!\n";
echo "Type anything: ";
$anyLine = fgets($stdin);
$line = $anyLine === false ? "" : trim($anyLine);
echo "You typed: {$line}\n";
