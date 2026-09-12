import { NastyTavern } from './src/runtime.js';

let instance = null;

function getInstance() {
    if (!instance) instance = new NastyTavern();
    return instance;
}

export async function onActivate() {
    await getInstance().activate();
}

export async function onEnable() {
    await getInstance().enable();
}

export async function onDisable() {
    await getInstance().disable();
}

export async function onClean() {
    await getInstance().clean();
}
