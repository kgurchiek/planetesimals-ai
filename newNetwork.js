const fs = require('fs');

const inputs = parseInt(process.argv[2]);
const layers = parseInt(process.argv[3]);
const neurons = parseInt(process.argv[4]);
const outputs = parseInt(process.argv[5]);

const weights = new Array(layers).fill().map(layer => layer = new Array(neurons).fill().map(neuron => neuron = new Array(neurons).fill().map(weight => weight = Math.random())));
weights[0] = new Array(neurons).fill().map(neuron => neuron = new Array(inputs).fill().map(weight => weight = Math.random()));
weights.push(new Array(outputs).fill().map(neuron => neuron = new Array(neurons).fill().map(weight => weight = Math.random())));
const biases = new Array(layers).fill().map(layer => layer = new Array(neurons).fill(0));
biases.push(new Array(outputs).fill(0));


fs.writeFileSync('./network.json', JSON.stringify({ weights, biases }));
