/* ========================================
 L u*mo‑Surf Animation – clean, modular version
 ============================================================== */

/* ------------------------------------------------------------
 1 ️*⃣ Configuration – colours / skins
 -------------------------------------------------------------- */
const CONFIG = {
    skins: [
        ["./dude_anim_nextgen_2_e.gif", "#000000",
        [[0, "black"], [0.45, "cyan"], [0.5, "white"], [0.55, "cyan"], [1, "black"]]],
        ["./dude_anim_nextgen_2_a.gif", "#ff00ff",
        [[0, "black"], [0.45, "purple"], [0.5, "pink"], [0.55, "purple"], [1, "black"]]],
        ["./dude_anim_nextgen_2_c.gif", "#ff0000",
        [[0, "black"], [0.45, "red"], [0.5, "white"], [0.55, "red"], [1, "black"]]],
        ["./dude_anim_nextgen_2_b.gif", "#00ff00",
        [[0, "black"], [0.45, "green"], [0.5, "white"], [0.55, "green"], [1, "black"]]],
        ["./dude_anim_nextgen_2_d.gif", "#0000ff",
        [[0, "black"], [0.45, "blue"], [0.5, "white"], [0.55, "blue"], [1, "black"]]],
        ["./dude_anim_nextgen_2_f.gif", "#888888",
        [[0, "black"], [0.45, "grey"], [0.5, "white"], [0.55, "grey"], [1, "black"]]]
    ]
};

const objects = {
    coin: "./bonus_0003.png",
    spike: "./enemy_spike.gif",
    slowdown: "./bonus_0004.png",
    speedup: "./bonus_0002.png",
    tempPause: "./bonus_0001.png",
    checkpoint: "./checkpoint.png"
}

let obstacles = [];

/* --------------------------------------------------------
 2 ️*⃣ Utility helpers
 -------------------------------------------------------------- */
const utils = {
    rndFloat(min, max) { return Math.random() * (max - min) + min; },

    lerp(cur, tgt, fac) { return cur + (tgt - cur) * fac; },

    /** Simple FPS logger – writes to #fps element */
    createFPSMeter(targetEl) {
        let last = null, fps = 0;
        const push = v => targetEl.innerText = `fps: ${v}`;
        return {
            tick() {
                const now = performance.now();
                if (last !== null) {
                    fps = Math.round(1000 / (now - last));
                    push(fps);
                }
                last = now;
            }
        };
    }
};

/* -----------------------------------------------
 3 ️*⃣ GIF manager – loads a GIF once and re‑uses the parsed image
 -------------------------------------------- */
class GifManager {
    constructor() {
        this.parser = GIF();                 // global GIF parser instance
        this.parser.waitTillDone = false;    // fire onload after first frame
        this.current = null;                 // reference used by renderer
        this.loading = false;
    }

    async load(url) {
        if (this.loading) return;
        this.loading = true;

        return new Promise((resolve, reject) => {
            this.parser.onload = () => {
                this.current = this.parser;
                this.loading = false;
                resolve(this.parser);
            };
            this.parser.onerror = err => {
                this.loading = false;
                reject(err);
            };
            this.parser.load(url);
        });
    }

    get sprite() { return this.current; }
}

/* -------------------------------------------
 4 ️*⃣ Wave engine – holds amplitude/frequency/speed and morphs them
 -------------------------------------------------------------- */
class WaveEngine {
    constructor() {
        this.amp = 0;
        this.freq = 0;
        this.spd = 0.01;
        this.phase = 0;
    }

    /** Randomly drift the wave parameters – called repeatedly */
    morph() {
        const targetAmp  = utils.rndFloat(0, 200);
        const targetFreq = utils.rndFloat(0.00, 0.01);
        const targetSpd  = utils.rndFloat(0.01, 0.1);

        this.amp  = utils.lerp(this.amp,  targetAmp,  0.0001);
        this.freq = utils.lerp(this.freq, targetFreq, 0.0001);
        this.spd  = utils.lerp(this.spd,  targetSpd,  0.0001);
    }

    /** Return a level index based on the current frequency */
    levelFromFreq() {
        const f = this.freq * 1000; // scale to a more convenient range
        if (f > 75) return 5;
        if (f > 50) return 4;
        if (f > 30) return 3;
        if (f > 15) return 2;
        if (f > 5)  return 1;
        return 0;
    }
    heightAt(x) {
        return this.canvasHeight / 2 + this.amp *
        Math.sin(this.freq * x + this.phase);
    }
    /** Advance the phase – called each render tick */
    step() { this.phase += this.spd; }
}

/* -------------------------------------------
 5 ️*⃣ Game state – coins, level, pause, jump
 -------------------------------------------------------------- */
class GameState {
    constructor() {
        this.coins = 0;
        this.level = 0;
        this.playing = true;
        this.jumpHeight = 0;   // pixel offset while jumping
        this.speed = 1;
        this.lastCheckpoint = {
            amp:0,
            speed:0.01,
            phase:0,
            freq:0
        }
    }

    collectCoin() {
        ++this.coins;
        const thresholds = [10, 25, 50, 100, 200, 500];
        for (let i = 0; i < thresholds.length; i++) {
            if (this.coins < thresholds[i]) {
                this.level = i;
                return;
            }
        }
        // exactly 500 → win
        if (this.coins === 500) this.finishGame("won");
    }

    slowdown(){
        this.speed -= 0.0001;
    }

    speedup(){
        this.speed += 0.0001;
    }

    saveCheckpoint(a,s,p,f){
        this.lastCheckpoint = {
            amp:a,
            speed:s,
            phase:p,
            freq:f
        }
    }

    finishGame(reason) {
        if (reason == "dead"){
            console.log("you died");
        }else if(reason == "won"){
            console.log("you won!!!");
        }else{
            console.log("🎉 Game finished!");
        }
    }

    /** Called when the player presses a jump key */
    triggerJump() {
        if (this.jumpHeight <= 3) this.jumpHeight = 60;
    }

    /** Decay the jump height each frame */
    decayJump() {
        if (this.jumpHeight > 0) this.jumpHeight--;
    }

    /** Toggle pause – fixed version (no double‑press) */
    togglePause() {
        this.playing = !this.playing;
    }
    drawObstacle(image, x){
        const { ctx, canvas, wave, state, dudeX, GIF_SCALE } = this;
        const sprite = this.gifMgr.sprite;
        if (!sprite?.image) return; // safety – should never happen

        const y  = canvas.height / 2 + wave.amp * Math.sin(wave.freq * x + wave.phase);
        const ny = canvas.height / 2 + wave.amp * Math.sin(wave.freq * (x + 1) + wave.phase);
        const angle = Math.atan2(ny - y, 1); // slope → rotation

        ctx.save();
        ctx.translate(x, y - state.jumpHeight);
        ctx.rotate(angle);
        ctx.drawImage(
            sprite.image,
            -(sprite.width * GIF_SCALE) / 2,
                      -(sprite.height * GIF_SCALE),
                      sprite.width * GIF_SCALE,
                      sprite.height * GIF_SCALE
        );
        ctx.restore();
    }
    addObstacle(){
        if (obstacles.length <= 2){
        switch(this.level){
            case 0:
                switch(Math.floor(Math.random * 3)){
                    case 0:
                        obstacles.push(objects.coin);
                        break;
                    case 1:
                        break;
                    case 2:
                        obstacles.push(objects.spike)
                }
                break;
            case 1:
                switch(Math.floor(Math.random * 5)){
                    case 0:
                        obstacles.push(objects.coin);
                        break;
                    case 1:
                    case 2:
                        break;
                    case 3:
                        obstacles.push(objects.spike);
                        break;
                    case 4:
                        obstacles.push(objects.slowdown);
                        break;
                }
                break;
            case 2:
                switch(Math.floor(Math.random * 7)){
                    case 0:
                        obstacles.push(objects.coin);
                        break;
                    case 1:
                    case 2:
                        break;
                    case 3:
                    case 4:
                        obstacles.push(objects.spike);
                        break;
                    case 5:
                        obstacles.push(objects.slowdown);
                        break;
                    case 6:
                        obstacles.push(objects.speedup);
                        break;
                }
                break;
            case 3:
                switch(Math.floor(Math.random * 9)){
                    case 0:
                    case 1:
                        obstacles.push(objects.coin);
                        break;
                    case 2:
                    case 3:
                        break;
                    case 4:
                    case 5:
                        obstacles.push(objects.spike);
                        break;
                    case 6:
                        obstacles.push(objects.slowdown);
                        break;
                    case 7:
                        obstacles.push(objects.speedup);
                        break;
                    case 8:
                        obstacles.push(objects.checkpoint);
                        break;
                }
                break;
            case 4:
                switch(Math.floor(Math.random * 11)){
                    case 0:
                    case 1:
                        obstacles.push(objects.coin);
                        break;
                    case 2:
                    case 3:
                        break;
                    case 4:
                    case 5:
                        obstacles.push(objects.spike);
                        break;
                    case 6:
                        obstacles.push(objects.slowdown);
                        break;
                    case 7:
                    case 8:
                        obstacles.push(objects.speedup);
                        break;
                    case 9:
                        obstacles.push(objects.checkpoint);
                        break;
                    case 10:
                        obstacles.push(objects.tempPause);
                        break;
                }
                break;
            case 5:
                switch(Math.floor(Math.random * 11)){
                    case 0:
                        obstacles.push(objects.coin);
                        break;
                    case 2:
                    case 3:
                        break;
                    case 4:
                    case 5:
                    case 6:
                        obstacles.push(objects.spike);
                        break;
                    case 7:
                    case 8:
                        obstacles.push(objects.slowdown);
                        break;
                    case 9:
                    case 10:
                        obstacles.push(objects.speedup);
                        break;
                    case 11:
                        obstacles.push(objects.checkpoint);
                        break;
                    case 12:
                        obstacles.push(objects.tempPause);
                        break;
                }
                break;
        }
        }
    }
    rectOverlap(a, b) {
        return a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y;
    }
    checkCollision(renderer, wave, state) {
        const { canvas, dudeX, GIF_SCALE } = renderer;
        const sprite = renderer.gifMgr.sprite;
        if (!sprite?.image) return false;   // nothing loaded yet

        // -- surfer’s foot position (same math as drawSurfer) ----
        const surferBottomY =
        canvas.height / 2 +
        wave.amp * Math.sin(wave.freq * dudeX + wave.phase) -
        state.jumpHeight;                  // include jump offset

        // ---- exact wave height at that X ----------------
        const waveY = wave.heightAt(dudeX);

        // obstacle check
        const surferBox = {
            x: dudeX - (sprite.width * GIF_SCALE) / 2,
            y: surferBottomY - (sprite.height * GIF_SCALE),
            w: sprite.width * GIF_SCALE,
            h: sprite.height * GIF_SCALE
        };

        return obstacles.some(ob => this.rectOverlap(surferBox, ob));
    }
}

/* ------------------------------------------------------------
 6 ️*⃣ Renderer – draws everything onto the canvas
 -------------------------------------------------------------- */
class Renderer {
    constructor(canvas, gifMgr, wave, state) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gifMgr = gifMgr;
        this.wave = wave;
        this.state = state;

        this.GIF_SCALE = 1.5;
        this.dudeX = 100;               // horizontal surfer position
    }

    /** Update background colour according to current level */
    updateBackground() {
        const bgHex = CONFIG.skins[this.state.level][1];
        this.canvas.style.backgroundColor = `${bgHex}22`;
    }

    /** Draw the sinusoidal wave with the gradient defined for the level */
    drawWave() {
        const { ctx, canvas, wave, state } = this;
        const gradStops = CONFIG.skins[state.level][2];

        for (let x = 0; x < canvas.width; x++) {
            const y  = canvas.height / 2 + wave.amp * Math.sin(wave.freq * x + wave.phase);
            const ny = canvas.height / 2 + wave.amp * Math.sin(wave.freq * (x + 1) + wave.phase);

            const grad = ctx.createLinearGradient(x, y - 20, x, y + 20);
            gradStops.forEach(([stop, col]) => grad.addColorStop(stop, col));

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 1, ny);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 7;
            ctx.stroke();
        }
    }

    /** Draw the surfer GIF at the correct Y‑position and rotation */
    drawSurfer() {
        const { ctx, canvas, wave, state, dudeX, GIF_SCALE } = this;
        const sprite = this.gifMgr.sprite;
        if (!sprite?.image) return; // safety – should never happen

        const y  = canvas.height / 2 + wave.amp * Math.sin(wave.freq * dudeX + wave.phase);
        const ny = canvas.height / 2 + wave.amp * Math.sin(wave.freq * (dudeX + 1) + wave.phase);
        const angle = Math.atan2(ny - y, 1); // slope → rotation

        ctx.save();
        ctx.translate(dudeX, y - state.jumpHeight);
        ctx.rotate(angle);
        ctx.drawImage(
            sprite.image,
            -(sprite.width * GIF_SCALE) / 2,
                      -(sprite.height * GIF_SCALE),
                      sprite.width * GIF_SCALE,
                      sprite.height * GIF_SCALE
        );
        ctx.restore();
    }

    /** One full render pass */
    render() {
        const { ctx, canvas, state } = this;
        if (!state.playing) return; // paused → nothing to draw

        // clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // draw components
        this.drawWave();
        this.drawSurfer();
    }
}

/* --------------------------------------------------------------
 7 ️*⃣ Input handler – keyboard shortcuts
 -------------------------------------------------------------- */
class InputHandler {
    constructor(state) {
        this.state = state;
        this.bind();
    }

    bind() {
        window.addEventListener('keydown', e => {
            const code = e.code;
            console.log(code);

            // Jump keys
            if (['KeyW', 'Space', 'ArrowUp'].includes(code)) {
                this.state.triggerJump();
                return;
            }

            // Pause / resume – CapsLock (fixed!)
            if (code === 'CapsLock') {
                this.state.togglePause();
                return;
            }
        });
    }
}



/* --------------------------------------------------------------
 8 ️*⃣ Bootstrap – glue everything together
 -------------------------------------------------------------- */
(async function main() {
    const canvas = document.getElementById('waveCanvas');
    const fpsEl  = document.getElementById('fps');
    const coinEl = document.getElementById('coins');
    // instantiate core objects
    const gifMgr   = new GifManager();
    const wave     = new WaveEngine();
    wave.canvasHeight = canvas.height;
    const game     = new GameState();
    const renderer = new Renderer(canvas, gifMgr, wave, game);
    const input    = new InputHandler(game);
    const fpsMeter = utils.createFPSMeter(fpsEl);

    // ------------------------------------------------------------------
    // Load the initial skin (level 0) before starting the loop
    // ------------------------------------------------------------------
    await gifMgr.load(CONFIG.skins[game.level][0]);
    renderer.updateBackground();

    // ------------------------------------------------------------------
    // Periodic wave morphing – runs independent of the render loop
    // ------------------------------------------------------------------
    setInterval(() => {
        wave.morph();
        // adapt level based on frequency (automatically changes skin)
        const newLevel = wave.levelFromFreq();
        if (newLevel !== game.level) {
            game.level = newLevel;
            gifMgr.load(CONFIG.skins[newLevel][0]).catch(console.error);
            renderer.updateBackground();
        }
    }, 250);

    // ------------------------------------------------------------------
    // Main animation loop (requestAnimationFrame)
    // ------------------------------------------------------------------
    function tick() {
        fpsMeter.tick();          // update FPS display
        coinEl.innerText = game.coins;
        wave.step();              // advance phase
        game.decayJump();         // handle jump decay
        for(i in game.checkCollision(renderer, wave, canvas)) {
            console.log(i);
            game.finishGame("dead");
            return;               // stop the loop for this frame
        }
        renderer.render();        // draw everything
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
})();
