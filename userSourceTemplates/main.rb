class Lexer
  TOKEN = %r{\d+|[()+\-*/]}

  def initialize(input_text)
    @tokens = input_text.scan(TOKEN)
    @position = 0
  end

  def next_token
    token = @tokens[@position]
    @position += 1
    token
  end

  def peek
    @tokens[@position]
  end
end

class Parser
  def initialize(lexer)
    @lexer = lexer
  end

  def parse
    expression = additive
    expression
  end

  private

  def additive
    left = multiplicative
    while (operator = @lexer.peek) == "+" || operator == "-"
      @lexer.next_token
      right = multiplicative
      left = { kind: :binary, operator: operator, left: left, right: right }
    end
    left
  end

  def multiplicative
    left = primary
    while (operator = @lexer.peek) == "*" || operator == "/"
      @lexer.next_token
      right = primary
      left = { kind: :binary, operator: operator, left: left, right: right }
    end
    left
  end

  def primary
    token = @lexer.next_token
    if token == "("
      inner = additive
      @lexer.next_token
      inner
    else
      { kind: :number, value: token.to_i }
    end
  end
end

class Evaluator
  def evaluate(node)
    case node[:kind]
    when :number
      node[:value]
    when :binary
      left_value = evaluate(node[:left])
      right_value = evaluate(node[:right])
      case node[:operator]
      when "+" then left_value + right_value
      when "-" then left_value - right_value
      when "*" then left_value * right_value
      when "/" then right_value.zero? ? 0 : left_value / right_value
      end
    end
  end
end

class ChainBuilder
  def initialize(values)
    @values = values
  end

  def map(&block)
    Enumerator.new do |yielder|
      @values.each { |value| yielder << value }
      yielder << @values.map(&block)
    end
  end
end

puts "WASMVerse Ruby showcase"
puts "Stage one: expression tree parser and evaluator"
expressions = ["(2 + 3) * 4 - 6", "10 * (5 - 2) + 8", "(7 + 1) / (2 * 2)"]
evaluator = Evaluator.new
expressions.each do |text|
  tree = Parser.new(Lexer.new(text)).parse
  puts "#{text} = #{evaluator.evaluate(tree)}"
end
puts "Stage two: lazy enumerators"
lazy_totals = (1..200_000)
  .lazy
  .select { |number| number % 7 == 0 && number % 3 == 0 }
  .map { |number| number * number }
  .first(6)
puts "first sixth-power-smooth candidates: #{lazy_totals.join(', ')}"
puts "Stage three: enumerator transformation chain"
chain = ChainBuilder.new([1, 2, 3, 4, 5, 6])
doubled = chain.map { |value| value * 2 }
source_values = []
6.times { source_values << doubled.next }
puts "source values: #{source_values.join(', ')}"
puts "transformed series: #{doubled.next.join(', ')}"
groups = [1, 2, 3, 4, 5, 6].group_by { |value| value.even? ? "even" : "odd" }
groups.each { |label, values| puts "#{label}: #{values.join(', ')}" }
puts "Stage four: interactive expression evaluator"
print "Enter an arithmetic expression: "
line = gets
if line.nil?
  line = "(2 + 3) * 4 - 6"
  puts "Using the default expression."
end
tree = Parser.new(Lexer.new(line)).parse
puts "#{line.strip} = #{evaluator.evaluate(tree)}"
puts "Showcase complete."
