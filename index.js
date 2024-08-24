const fs = require('fs');
const worker = require('worker_threads');
const planetesimals = require('./planetesimals.js');
const maxThreads = 14;
const agentCount = 1000;

function generate(inputs, layers) {
  const values = {};
  const output = [];
  for (let i = 0; i < layers.length; i++) {
    for (let j = 0; j < layers[i].length; j++) {
      if (i == 0) values[layers[i][j].id] = isNaN(inputs[j]) ? 0 : inputs[j];
      else {
        values[layers[i][j].id] = layers[i][j].bias;
        for (const connection of layers[i][j].connections) values[layers[i][j].id] += connection.weight * values[connection.id];
        if (isNaN(values[layers[i][j].id])) console.log(layers[i][j].id, JSON.stringify(layers, '', '  '));
        if (i == layers.length - 1) output.push(values[layers[i][j].id]);
      }
    }
  }
  return output;
}

function mutate(agent, mode, end) {
  switch (mode || Math.floor(Math.random() * 4)) {
    case 0: {
      // nothing
      break;
    }
    case 1: {
      // shift weights and biases
      for (let i = 1; i < agent.layers.length; i++) for (const node of agent.layers[i]) {
        if (Math.random() < 0.2) node.bias += Math.random() / 2 - 0.25;
        for (const connection of node.connections) if (Math.random() < 0.1) connection.weight += Math.random() / 2 - 0.25;
      }
      break;
    }
    case 2: {
      // new connection
      const allNodes = [];
      for (let i = 0; i < agent.layers.length; i++) for (let j = 0; j < agent.layers[i].length; j++) allNodes.push({ layer: i, node: j });
      let followingNodes = allNodes.filter(a => a.layer > 0);
      let start;
      while (start == null && followingNodes.length > 0) {
        if (end == null) end = followingNodes[Math.floor(Math.random() * followingNodes.length)];
        const previousNodes = allNodes.filter(a => a.layer < end.layer && agent.layers[end.layer][end.node].connections.filter(b => b.id == agent.layers[a.layer][a.node].id).length == 0);
        if (previousNodes.length == 0) {
          followingNodes = followingNodes.filter(a => a.layer != end.layer || a.node != end.node);
          end = null;
        } else start = previousNodes[Math.floor(Math.random() * previousNodes.length)];
      }
      if (followingNodes.length == 0 && mode == null) mutate(agent, 3)
      else if (followingNodes.length > 0) {
        const startId = agent.layers[start.layer][start.node].id;
        agent.layers[end.layer][end.node].connections.push({ id: startId, weight: Math.random() * 2 - 1 });
      }
      break;
    }
    case 3: {
      // new node
      const allNodes = [];
      for (let i = 1; i < agent.layers.length; i++) for (const node of agent.layers[i]) for (const connection of node.connections) allNodes.push(node.id);
      const targetId = allNodes[Math.floor(Math.random() * allNodes.length)];
      let index = -1;
      for (let i = 1; i < agent.layers.length && index == -1; i++) {
        index = agent.layers[i].findIndex(a => a.id == targetId);
        if (index == -1) continue;
        const target = agent.layers[i][index].connections[Math.floor(Math.random() * agent.layers[i][index].connections.length)];
        const startLayer = agent.layers.findIndex(a => a.findIndex(b => b.id == target.id) > -1);
        if (startLayer + 1 == i) {
          i++;
          agent.layers = agent.layers.slice(0, startLayer + 1).concat([[{ id: agent.nodeCount++, bias: 0, connections: [{ id: target.id, weight: Math.random() * 2 - 1 }] }]], agent.layers.slice(startLayer + 1));
          target.id = agent.layers[i - 1][0].id;
          agent.test = true;
        } else {
          const newLayer = Math.floor(Math.random() * (i - startLayer - 1)) + startLayer + 1;
          agent.layers[newLayer].push({ id: agent.nodeCount++, bias: 0, connections: [{ id: target.id, weight: Math.random() * 2 - 1 }] });
          target.id = agent.layers[newLayer][agent.layers[newLayer].length - 1].id;
        }
      }
      break;
    }
  }
}

async function generation(inputs, outputs, agentCount, winners, mutators, record = false) {
  const start = new Date().getTime();
  let agents = [];
  let threadQueue = [];
  let threads = [];
  for (let i = 0; i < maxThreads; i++) {
    threads.push({ worker: new worker.Worker('./index.js'), ready: true });
    threads[i].worker.on('message', (message) => {
      threads[i].ready = true;
      if (typeof message == 'object') if (agents.push(message) % 10 == 0) console.log(`${agents.length}/${agentCount}`);
      updateQueue();
    })
  }

  function updateQueue() {
    while (threadQueue.length > 0 && threads.filter(a => a.ready == true).length > 0) {
      for (const thread of threads) {
        if (!thread.ready) continue;
        thread.ready = false;
        thread.worker.postMessage(threadQueue[0]);
        threadQueue.splice(0, 1);
      }
    }
  }
  if (winners == null) {
    for (let i = 0; i < agentCount; i++) {
      const workerData = { nodeCount: 0, record }
      workerData.layers = [new Array(inputs).fill().map(a => ({ id: workerData.nodeCount++, bias: 0, connections: [] })), new Array(outputs).fill().map(a => ({ id: workerData.nodeCount++, bias: 0, connections: [] }))]
      for (let i = 0; i < outputs; i++) mutate(workerData, 2, { layer: 1, node: i });
      threadQueue.push(workerData);
    }
    updateQueue();
  } else {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < mutators.length; j++) {
        const workerData = { record: record && i == 0 && j == 0, nodeCount: 0, layers: [] };
        for (const layer of mutators[j].layers) {
          const newLayer = [];
          for (const node of layer) {
            workerData.nodeCount = Math.max(workerData.nodeCount, node.id);
            let newConnections = [];
            for (const connection of node.connections) newConnections.push({ id: connection.id, weight: connection.weight });
            newLayer.push({ id: node.id, bias: node.bias, connections: newConnections });
          }
          workerData.layers.push(newLayer);
        }
        workerData.nodeCount += 1;
        if (i > 0 || j >= winners || true) mutate(workerData);
        threadQueue.push(workerData);
      }
    }
    mutators = null;
    updateQueue();
  }

  async function doneCheck(res) {
    if (agents.length == agentCount) res();
    else setTimeout(() => doneCheck(res));
  }
  await (new Promise(res => doneCheck(res)));
  console.log(`Finished in ${new Date().getTime() - start} milliseconds`);

  agents.sort((a, b) => b.game.score - a.game.score);
  for (const thread of threads) await thread.worker.terminate();
  return agents;
}

(async () => {
  if (worker.isMainThread) {
    let latest = await generation(47, 5, agentCount);
    let average = 0;
    latest.forEach(a => average += a.game.score);
    average /= latest.length;
    console.log(`Generaton 1: average: ${average}, median: ${latest[(Math.floor(latest.length/2) + Math.ceil(latest.length/2))/2].game.score}`, latest.map(a => ({ score: a.game.score, level: a.game.level })));
    let recording = latest[0].recording;
    fs.writeFileSync(`./winners/winner1.json`, JSON.stringify(latest.map(a => ({ layers: a.layers })).slice(0, agentCount / 2), '', '  '));
    latest.forEach(a => a.recording = null);
    console.log('Saved winners.');
    fs.writeFileSync(`./recordings/recording1.json`, JSON.stringify(recording, '', '  '));
    recording = null;
    console.log('Saved recording.');
    for (let i = 0; i < 5001; i++) {
      latest = await generation(47, 5, agentCount, agentCount / 10, latest.slice(0, agentCount / 2), i % 100 == 0);
      average = 0;
      latest.forEach(a => average += a.game.score);
      average /= latest.length;
      console.log(`Generation ${i + 2}: average: ${average}, median: ${latest[(Math.floor(latest.length/2) + Math.ceil(latest.length/2))/2].game.score}`, latest.map(a => ({ score: a.game.score, level: a.game.level })));
      for (const agent of latest) {
        if (agent.recording.length > 0) {
          fs.writeFileSync(`./winners/winner${i + 2}.json`, JSON.stringify(latest.map(a => ({ layers: a.layers })).slice(0, agentCount / 2), '', '  '));
          console.log('Saved winners.');
          fs.writeFileSync(`./recordings/recording${i + 2}.json`, JSON.stringify(agent.recording, '', '  '));
          delete agent.recording;
          console.log('Saved recording.');
        }
      }
    }
    recording = latest[0].recording;
    fs.writeFileSync('./finalWinners.json', JSON.stringify(latest.map(a => ({ layers: a.layers })).slice(0, agentCount / 2), '', '  '));
    latest = null;
    console.log('Saved winners.');
    fs.writeFileSync('./finalRecording.json', JSON.stringify(recording, '', '  '));
    recording = null;
    console.log('Saved recording.');
  } else {
    worker.parentPort.on('message', (message) => {
      let agent = planetesimals(message.record);
      //const agent = { mass: [{ position: { x: 0, y: 0 }, angle: 0, velocity: { x: 0, y: 0 }, angularVelocity: 0 }], cycle: () => {}, keys: [], game: { score: 0 }, recording: [] };
      for (let i = 0; i < 3600; i++) {
        const asteroids = [];
        agent.mass.slice(1).forEach(a => {
          const distX = a.position.x - agent.mass[0].position.x;
          const distY = a.position.y - agent.mass[0].position.y;
          a.playerAngle = Math.atan2(distY, distX) + Math.PI * 3/2;
          if (a.playerAngle > 0) a.playerAngle = Math.abs(a.playerAngle % (Math.PI * 2))
          else a.playerAngle = Math.PI * 2 - Math.abs(a.playerAngle % (Math.PI * 2))
          a.playerDist = Math.sqrt(distX**2 + distY**2);
          const nextDistX = (a.position.x + a.velocity.x) - agent.mass[0].position.x;
          const nextDistY = (a.position.y + a.velocity.y) - agent.mass[0].position.y;
          a.velocity.playerAngle = (Math.atan2(nextDistY, nextDistX) + Math.PI * 3/2) - a.playerAngle;
          a.velocity.playerDist = Math.sqrt(nextDistX**2 + nextDistY**2) - a.playerDist;
        });
        agent.mass.slice(1).sort((a, b) => a.playerDist - b.playerDist).slice(0, 10).forEach(a => asteroids.push(a.playerAngle, a.playerDist, a.velocity.playerAngle, a.velocity.playerDist));
        const output = generate([agent.mass[0].position.x, agent.mass[0].position.y, agent.mass[0].velocity.x, agent.mass[0].velocity.y, agent.mass[0].angle, agent.mass[0].angularVelocity, agent.game.width].concat(asteroids), message.layers);
        if (output.findIndex(a => isNaN(a)) != -1) console.log(output)
        agent.keys[37] = output[0] > 0.5; // left
        agent.keys[38] = output[1] > 0.5; // up
        agent.keys[39] = output[2] > 0.5; // right
        agent.keys[40] = output[3] > 0.5; // down
        agent.keys[32] = output[4] > 0.5; // space
        agent.cycle();
      }
      agent.game.score += agent.game.startingMassValue - agent.game.currentMass;
      /*agent.game.score -= Math.abs(agent.keys[32] - 1)
      agent.game.score -= Math.abs(agent.keys[37] - 2)
      agent.game.score -= Math.abs(agent.keys[38] - 3)
      agent.game.score -= Math.abs(agent.keys[39] - 4)
      agent.game.score -= Math.abs(agent.keys[40] - 5)*/
      worker.parentPort.postMessage({ game: { score: agent.game.score, level: agent.game.level }, layers: message.layers, recording: agent.recording });
      message = null;
      agent = null;
    });
  }
})();
