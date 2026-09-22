local function prime_sieve(limit)
    local flags = {}
    for index = 2, limit do
        flags[index] = true
    end
    local number = 2
    while number * number <= limit do
        if flags[number] then
            for multiple = number * number, limit, number do
                flags[multiple] = false
            end
        end
        number = number + 1
    end
    local primes = {}
    for index = 2, limit do
        if flags[index] then
            primes[#primes + 1] = index
        end
    end
    return primes
end

local Entity = {}
Entity.__index = Entity

function Entity.new(name, health)
    local instance = setmetatable({ name = name, health = health, alive = true }, Entity)
    return instance
end

function Entity:apply_damage(amount)
    self.health = self.health - amount
    if self.health <= 0 then
        self.health = 0
        self.alive = false
    end
    return self.health, self.alive
end

function Entity:__tostring()
    local state = self.alive and "standing" or "fallen"
    return string.format("%s (%d hp, %s)", self.name, self.health, state)
end

local function scheduler(steps)
    local co = coroutine.create(function()
        for step_index = 1, #steps do
            coroutine.yield(steps[step_index])
        end
    end)
    return co
end

local function rolling_window(values, width)
    local sums = {}
    local total = 0
    for index, value in ipairs(values) do
        total = total + value
        if index > width then
            total = total - values[index - width]
        end
        if index >= width then
            sums[#sums + 1] = total
        end
    end
    return sums
end

print("WASMVerse Lua showcase")
print("Stage one: metatable entity system")
local hero = Entity.new("archivist", 30)
local rival = Entity.new("compiler", 25)
print(tostring(hero))
print(tostring(rival))
hero:apply_damage(12)
rival:apply_damage(25)
print(tostring(hero))
print(tostring(rival))
print("Stage two: coroutine scheduler")
local jobs = {
    "read plate 01",
    "read plate 02",
    "cross-check formulas",
    "ink final sheet",
}
local thread = scheduler(jobs)
while coroutine.status(thread) ~= "dead" do
    local ok, job = coroutine.resume(thread)
    if ok and job then
        print("scheduled: " .. job)
    end
end
print("Stage three: rolling window over prime stream")
local primes = prime_sieve(200)
local window_sums = rolling_window(primes, 10)
print("prime count up to 200: " .. #primes)
print("window sums: " .. table.concat(window_sums, ", "))
print("largest prime: " .. primes[#primes])
print("Showcase complete.")
