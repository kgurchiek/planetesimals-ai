const { weights, biases } = require('./network.json');

const data = [0.1, 0.2, 0.3, 0.4, 0.5];

class Neuron {
  constructor(inputs, weights, bias = 0) {
    this.inputs = inputs;
    this.weights = weights || new Array(inputs.length).fill().map(a => a = Math.random());
    this.bias = bias;
    this.value = this.bias;
    for (let i = 0; i < inputs.length; i++) this.value += inputs[i] * weights[i];
    this.value = Math.max(0, this.value);
  }
}

class Layer {
  constructor(input, weights, biases) {
    this.input = input;
    this.neurons = [];
    for (let i = 0; i < weights.length; i++) this.neurons.push(new Neuron(input.neurons.map(a => a = a.value), weights[i], biases[i]));
  }
}

function generate(weights, biases) {
  layers = [new Layer({ neurons: [{ value: 1 }]}, weights[0], biases[0])];
  for (let i = 1; i < weights.length - 1; i++) layers.push(new Layer(layers[i - 1], weights[i], biases[i]));
  return new Layer(layers[layers.length - 1], weights[layers.length], biases[layers.length])
}

function cost(output, target) {
  let cost = 0;
  for (let i = 0; i < target.length; i++) cost += Math.abs(target[i] - output.neurons[i].value)
  return cost;
}

let output = generate(weights, biases);
console.log(output.neurons.map(a => a = a.value), cost(output, data))
let explorationMultiplier = 1;
for (let i = 0; i < 10000; i++) {
  if ((i + 1) % 100 == 0) {
    explorationMultiplier = (i / 10000)**4;
    console.log(i, cost(output, data))
  }
  let exploration = Math.random() / 4 * explorationMultiplier;
  let layer = Math.floor(Math.random() * weights.length);
  let neuron = Math.floor(Math.random() * weights[layer].length);
  let weight = Math.floor(Math.random() * weights[layer][neuron].length);
  let oldWeight = weights[layer][neuron][weight];
  weights[layer][neuron][weight] += exploration;
  let sample1 = generate(weights, biases);
  weights[layer][neuron][weight] -= exploration * 2;
  let sample2 = generate(weights, biases);
  weights[layer][neuron][weight] = oldWeight;
  if (cost(sample1, data) < cost(output, data)) {
    output = sample1;
    weights[layer][neuron][weight] = oldWeight + exploration;
  }
  if (cost(sample2, data) < cost(output, data)) {
    output = sample2;
    weights[layer][neuron][weight] = oldWeight - exploration;
  }

  exploration = Math.random() * explorationMultiplier;
  layer = Math.floor(Math.random() * biases.length);
  neuron = Math.floor(Math.random() * biases[layer].length);
  let oldBias = biases[layer][neuron];
  biases[layer][neuron] += exploration;
  sample1 = generate(weights, biases);
  biases[layer][neuron] -= exploration * 2
  sample2 = generate(weights, biases);
  biases[layer][neuron] = oldBias;
  if (cost(sample1, data) < cost(output, data)) {
    output = sample1;
    biases[layer][neuron] = oldBias + exploration;
  }
  if (cost(sample2, data) < cost(output, data)) {
    output = sample2;
    biases[layer][neuron] = oldBias - exploration;
  }
}

console.log(generate(weights, biases))
