/*
Aim Notes:
- Walls had to be removed to prevent the agent from moving backwards into it to point inward
- Movement had to be locked to prevent the agent from simply moving backward
- Angular friction had to be turned up to make it easier for it to figure out how to rotate
- Using movement keys was punished before they were unlocked to prevent it from "accidentally" moving after movement was unlocked
- Luckily already worked on dynamic targets other than 1000, 1000
- Extra asteroid data messed it up, so it was removed for initial training
*/

const fs = require('fs');
const worker = require('worker_threads');
const planetesimals = require('./planetesimals.js');
const config = require('./config.json');

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
  for (let i = 0; i < config.maxThreads; i++) {
    threads.push({ worker: new worker.Worker('./index.js'), ready: true });
    threads[i].worker.on('message', (message) => {
      threads[i].ready = true;
      if (typeof message == 'object') if (agents.push(message) % 100 == 0) console.log(`${agents.length}/${agentCount}`);
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
  if (mutators == null && config.winners) {
    mutators = JSON.parse(fs.readFileSync(config.winners).toString());
    let difference = 4 * config.asteroidCount + 6 - mutators[0].layers[0].length;
    if (difference > 0) {
      for (const mutator of mutators) {
        let id = 0;
        for (layer of mutator.layers) for (const node of layer) if (node.id > id) id = node.id;
        for (let i = 0; i < difference; i++) mutator.layers[0].push({ id: i + id + 1, bias: 0, connections: [] });
      }
    }
  }
  if (mutators == null) {
    for (let i = 0; i < agentCount; i++) {
      const workerData = { nodeCount: 0, record };
      workerData.layers = [new Array(inputs).fill().map(a => ({ id: workerData.nodeCount++, bias: 0, connections: [] })), new Array(outputs).fill().map(a => ({ id: workerData.nodeCount++, bias: 0, connections: [] }))];
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

  agents.sort((a, b) => b.averageScore - a.averageScore);
  for (const thread of threads) await thread.worker.terminate();
  return agents;
}

const logGeneration = (generation, latest) => console.log(`Generation ${generation}: average: ${latest.reduce((a, b) => a + b.averageScore, 0) / latest.length}, median: ${latest[(Math.floor(latest.length/2) + Math.ceil(latest.length/2))/2].averageScore}`, latest.slice(0, 10).map(a => ({ /*scores: a.scores.map(a => Math.round(a)).join(', '),*/ score: a.averageScore, /*levels: a.levels.join(', '), masses: a.masses.map(a => a.length - 1).join(', ')*/ })));

(async () => {
  if (worker.isMainThread) {
    let latest = await generation(4 * config.asteroidCount + 6, 5, config.agentCount, config.agentCount / 10, null);
    logGeneration(config.offset, latest)
    for (let i = config.offset; i < config.generations; i++) {
      latest = await generation(4 * config.asteroidCount + 6, 5, config.agentCount, config.agentCount / 10, latest.slice(0, config.agentCount / 2), i % 100 == 99);
      logGeneration(i + 1, latest);
      for (const agent of latest) {
        if (agent.recording[0].length > 0) {
          fs.writeFileSync(`./winners/winner${i + 1}.json`, JSON.stringify(latest.map(a => ({ layers: a.layers })).slice(0, config.agentCount / 2), '', '  '));
          console.log('Saved winners.');
          fs.writeFileSync(`./recordings/recording${i + 1}.json`, JSON.stringify(agent.recording[0], '', '  '));
          console.log('Saved recording.');
        }
        delete agent.recording;
      }
    }
    for (const agent of latest) {
      if (agent.recording.length > 0) {
        fs.writeFileSync(`./finalWinners.json`, JSON.stringify(latest.map(a => ({ layers: a.layers })).slice(0, config.agentCount / 2), '', '  '));
        console.log('Saved winners.');
        fs.writeFileSync(`./finalRecording.json`, JSON.stringify(agent.recording, '', '  '));
        delete agent.recording;
        console.log('Saved recording.');
      }
    }
  } else {
    worker.parentPort.on('message', (message) => {
      let scores = [];
      let levels = [];
      let recordings = [];
      let masses = [];
      for (let run = 0; run < config.gameCount; run++) {
        let agent = planetesimals(message.record);
        //const agent = { mass: [{ position: { x: 0, y: 0 }, angle: 0, velocity: { x: 0, y: 0 }, angularVelocity: 0 }], cycle: () => {}, keys: [], game: { score: 0 }, recording: [] };
        for (let i = 0; i < config.frames; i++) {
          const asteroids = Array(4 * config.asteroidCount).fill(0).map(a => Math.random() * 4000 - 2000);
          agent.mass.push({ position: { x: 1000, y: 1000 }, velocity: { x: 0, y: 0 }});
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
          agent.mass.slice(1).sort((a, b) => a.playerDist - b.playerDist).slice(0, config.asteroidCount).forEach((a, i) => {
            asteroids[i] = a.playerAngle;
            asteroids[i + 1] = a.playerDist;
            asteroids[i + 2] = a.velocity.playerAngle;
            asteroids[i + 3] = a.velocity.playerDist;
          });
          agent.mass.splice(1);
          const output = generate([agent.mass[0].position.x, agent.mass[0].position.y, agent.mass[0].velocity.x, agent.mass[0].velocity.y, agent.mass[0].angle, agent.mass[0].angularVelocity].concat(asteroids), message.layers);
          if (output.findIndex(a => isNaN(a)) != -1) console.log(output)
          agent.keys[37] = output[0] > 0.5; // left
          agent.keys[38] = false //output[1] > 0.5; // up
          agent.keys[39] = output[2] > 0.5; // right
          agent.keys[40] = false //output[3] > 0.5; // down
          // agent.keys[32] = output[4] > 0.5; // space
          agent.cycle();

          agent.game.score -= Math.abs(agent.mass[0].angle - asteroids[0]);
          if (output[1] > 0.5) agent.game.score -= 0.5;
          if (output[3] > 0.5) agent.game.score -= 0.5;
        }
        scores.push(agent.game.score);
        levels.push(agent.game.level);
        recordings.push(agent.recording);
        masses.push(agent.mass);
      }
      worker.parentPort.postMessage({ scores, averageScore: scores.reduce((a, b) => a + b) / scores.length, levels, layers: message.layers, recording: recordings, masses });
      message = null;
      agent = null;
    });
  }
})();
