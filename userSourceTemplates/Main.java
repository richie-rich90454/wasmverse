import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        System.out.println("=== Hello from the Universal WASM Platform ===");
        System.out.print("Your name? ");
        Scanner scanner = new Scanner(System.in);
        String name = scanner.nextLine();
        System.out.println("Hello, " + name + "!");
        scanner.close();
    }
}
