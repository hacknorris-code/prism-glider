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

/* -----------------------------------------
 *  GifManager – works with the gifparse.js library you uploaded
 *  ------------------------------------------------------------- */
/* -------------------------------------------------
 *  GifManager – returns a sprite whose .image updates
 *  automatically as the GIF plays.
 *  ------------------------------------------------ */
class GifManager {
    constructor() {
        // url → { gifObj, getImage() }
        this.cache   = new Map();
        this.current = null;               // sprite currently displayed
    }

    /**
     * Load (or retrieve from cache) a GIF and start its playback.
     * Resolves to an object exposing a getter `image` that always
     * returns the *current* frame canvas.
     */
    async preload(url) {
        if (this.cache.has(url)) return this.cache.get(url);

        const gif = GIF();                 // the object from gifparse.js
        gif.waitTillDone = false;          // fire onload after first frame
        gif.playOnLoad   = false;          // we’ll start playback ourselves

        return new Promise((resolve, reject) => {
            gif.onload = () => {
                // First frame is ready – start the animation loop
                gif.play();               // <-- this makes the library cycle frames

                // Build a thin wrapper that always returns the *current* canvas
                const sprite = {
                    /** Getter – the renderer will call sprite.image each frame */
                    get image() { return gif.image; },

                           /** Width / height of the GIF (constant) */
                           get width()  { return gif.width; },
                           get height() { return gif.height; },

                           /** Expose the raw gif object if you ever need it */
                           _gif: gif
                };

                this.cache.set(url, sprite);
                resolve(sprite);
            };
            gif.onerror = reject;
            gif.load(url);                 // start the XHR + parsing
        });
    }

    /** Public API used by the game – guarantees a ready sprite */
    async load(url) {
        const sprite = await this.preload(url);
        this.current = sprite;       // mark as the active skin
        return sprite;
    }

    /** Renderer accesses this */
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
        const f = this.amp ; // scale to a more convenient range
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

/* -------------------------------------------------------
 *  4.5 Obstacle – holds image, position and simple movement
 *  ------------------------------------------------------- */
class Obstacle {
    constructor(imgUrl, x) {
        this.url = imgUrl;           // path to the PNG/GIF
        this.x = x;                  // start X (off‑screen right)
        this.loaded = false;         // flag once the image is ready
        this.img = new Image();
        this.img.onload = () => {
            this.w = this.img.width * Obstacle.SCALE;
            this.h = this.img.height * Obstacle.SCALE;
            this.loaded = true;
        };
        this.img.src = imgUrl;
    }

    static SCALE = 1.5;               // same scale used for the surfer

    /** Move left according to the current wave speed */
    update(speed) {
        this.x -= speed;               // speed comes from GameState.speed
    }

    /** Render if the image is ready */
    draw(ctx, wave, dudeX, jumpHeight) {
        if (!this.loaded) return;

        // Compute Y exactly like the surfer does (wave height at this X)
        const y = wave.canvasHeight / 2 +
        wave.amp * Math.sin(wave.freq * this.x + wave.phase);

        // Optional: rotate to match wave slope (like surfer)
        const ny = wave.canvasHeight / 2 +
        wave.amp * Math.sin(wave.freq * (this.x + 1) + wave.phase);
        const angle = Math.atan2(ny - y, 1);

        ctx.save();
        ctx.translate(this.x, y - jumpHeight);
        ctx.rotate(angle);
        ctx.drawImage(
            this.img,
            -(this.w / 2),
                      -this.h,
                      this.w,
                      this.h
        );
        ctx.restore();
    }

    /** Bounding box for collision detection */
    getBox(wave, jumpHeight) {
        const y = wave.canvasHeight / 2 +
        wave.amp * Math.sin(wave.freq * this.x + wave.phase);
        return {
            x: this.x - this.w / 2,
            y: y - this.h - jumpHeight,
            w: this.w,
            h: this.h
        };
    }
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
    addObstacle(renderer){
        if (obstacles.length < 2){
        switch(this.level){
            case 0:
                switch(Math.floor(Math.random() * 3)){
                    case 0:
                        obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                        break;
                    case 1:
                        break;
                    case 2:
                        obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                }
                break;
            case 1:
                switch(Math.floor(Math.random() * 5)){
                    case 0:
                        obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                        break;
                    case 1:
                    case 2:
                        break;
                    case 3:
                        obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                        break;
                    case 4:
                        obstacles.push(new Obstacle(objects.slowdown, renderer.canvas.width + 50));
                        break;
                }
                break;
            case 2:
                switch(Math.floor(Math.random() * 7)){
                    case 0:
                        obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                        break;
                    case 1:
                    case 2:
                        break;
                    case 3:
                    case 4:
                        obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                        break;
                    case 5:
                        obstacles.push(new Obstacle(objects.slowdown, renderer.canvas.width + 50));
                        break;
                    case 6:
                        obstacles.push(new Obstacle(objects.speedup, renderer.canvas.width + 50));
                        break;
                }
                break;
            case 3:
                switch(Math.floor(Math.random() * 9)){
                    case 0:
                    case 1:
                        obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                        break;
                    case 2:
                    case 3:
                        break;
                    case 4:
                    case 5:
                        obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                        break;
                    case 6:
                        obstacles.push(new Obstacle(objects.slowdown, renderer.canvas.width + 50));
                        break;
                    case 7:
                        obstacles.push(new Obstacle(objects.speedup, renderer.canvas.width + 50));
                        break;
                    case 8:
                        obstacles.push(new Obstacle(objects.checkpoint, renderer.canvas.width + 50));
                        break;
                }
                break;
            case 4:
                switch(Math.floor(Math.random() * 11)){
                    case 0:
                    case 1:
                        obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                        break;
                    case 2:
                    case 3:
                        break;
                    case 4:
                    case 5:
                        obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                        break;
                    case 6:
                        obstacles.push(new Obstacle(objects.slowdown, renderer.canvas.width + 50));
                        break;
                    case 7:
                    case 8:
                        obstacles.push(new Obstacle(objects.speedup, renderer.canvas.width + 50));
                        break;
                    case 9:
                        obstacles.push(new Obstacle(objects.checkpoint, renderer.canvas.width + 50));
                        break;
                    case 10:
                        obstacles.push(new Obstacle(objects.tempPause, renderer.canvas.width + 50));
                        break;
                }
                break;
            case 5:
                switch(Math.floor(Math.random() * 11)){
                    case 0:
                        obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                        break;
                    case 2:
                    case 3:
                        break;
                    case 4:
                    case 5:
                    case 6:
                        obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                        break;
                    case 7:
                    case 8:
                        obstacles.push(new Obstacle(objects.slowdown, renderer.canvas.width + 50));
                        break;
                    case 9:
                    case 10:
                        obstacles.push(new Obstacle(objects.speedup, renderer.canvas.width + 50));
                        break;
                    case 11:
                        obstacles.push(new Obstacle(objects.checkpoint, renderer.canvas.width + 50));
                        break;
                    case 12:
                        obstacles.push(new Obstacle(objects.tempPause, renderer.canvas.width + 50));
                        break;
                }
                break;
        }
        switch(this.level){
            case 0:
                switch(Math.floor(Math.random() * 3)){
                    case 0:
                        obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                        break;
                    case 1:
                        break;
                    case 2:
                        obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                }
                break;
                case 1:
                    switch(Math.floor(Math.random() * 5)){
                        case 0:
                            obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                            break;
                        case 1:
                        case 2:
                            break;
                        case 3:
                            obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                            break;
                        case 4:
                            obstacles.push(new Obstacle(objects.slowdown, renderer.canvas.width + 50));
                            break;
                    }
                    break;
                case 2:
                    switch(Math.floor(Math.random() * 7)){
                        case 0:
                            obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                            break;
                        case 1:
                        case 2:
                            break;
                        case 3:
                        case 4:
                            obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                            break;
                        case 5:
                            obstacles.push(new Obstacle(objects.slowdown, renderer.canvas.width + 50));
                            break;
                        case 6:
                            obstacles.push(new Obstacle(objects.speedup, renderer.canvas.width + 50));
                            break;
                    }
                    break;
                case 3:
                    switch(Math.floor(Math.random() * 9)){
                        case 0:
                        case 1:
                            obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                            break;
                        case 2:
                        case 3:
                            break;
                        case 4:
                        case 5:
                            obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                            break;
                        case 6:
                            obstacles.push(new Obstacle(objects.slowdown, renderer.canvas.width + 50));
                            break;
                        case 7:
                            obstacles.push(new Obstacle(objects.speedup, renderer.canvas.width + 50));
                            break;
                        case 8:
                            obstacles.push(new Obstacle(objects.checkpoint, renderer.canvas.width + 50));
                            break;
                    }
                    break;
                case 4:
                    switch(Math.floor(Math.random() * 11)){
                        case 0:
                        case 1:
                            obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                            break;
                        case 2:
                        case 3:
                            break;
                        case 4:
                        case 5:
                            obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                            break;
                        case 6:
                            obstacles.push(new Obstacle(objects.slowdown, renderer.canvas.width + 50));
                            break;
                        case 7:
                        case 8:
                            obstacles.push(new Obstacle(objects.speedup, renderer.canvas.width + 50));
                            break;
                        case 9:
                            obstacles.push(new Obstacle(objects.checkpoint, renderer.canvas.width + 50));
                            break;
                        case 10:
                            obstacles.push(new Obstacle(objects.tempPause, renderer.canvas.width + 50));
                            break;
                    }
                    break;
                case 5:
                    switch(Math.floor(Math.random() * 11)){
                        case 0:
                            obstacles.push(new Obstacle(objects.coin, renderer.canvas.width + 50));
                            break;
                        case 2:
                        case 3:
                            break;
                        case 4:
                        case 5:
                        case 6:
                            obstacles.push(new Obstacle(objects.spike, renderer.canvas.width + 50));
                            break;
                        case 7:
                        case 8:
                            obstacles.push(new Obstacle(objects.slowdown, renderer.canvas.width + 50));
                            break;
                        case 9:
                        case 10:
                            obstacles.push(new Obstacle(objects.speedup, renderer.canvas.width + 50));
                            break;
                        case 11:
                            obstacles.push(new Obstacle(objects.checkpoint, renderer.canvas.width + 50));
                            break;
                        case 12:
                            obstacles.push(new Obstacle(objects.tempPause, renderer.canvas.width + 50));
                            break;
                    }
                    break;
        }
        }else{
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
        if (!sprite?.image) return false;

        const surferBottomY =
        canvas.height / 2 +
        wave.amp * Math.sin(wave.freq * dudeX + wave.phase) -
        state.jumpHeight;

        const surferBox = {
            x: dudeX - (sprite.width * GIF_SCALE) / 2,
            y: surferBottomY - (sprite.height * GIF_SCALE),
            w: sprite.width * GIF_SCALE,
            h: sprite.height * GIF_SCALE
        };

        // Test each obstacle’s box
        return obstacles.some(obs => this.rectOverlap(surferBox, obs.getBox(wave, state.jumpHeight)));
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
        console.log('Sprite at draw:', sprite);
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

    drawObstacles() {
        const { ctx, wave, state, dudeX, GIF_SCALE } = this;
        obstacles.forEach(obs => {
            obs.draw(ctx, wave, dudeX, state.jumpHeight);
        });
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
        this.drawObstacles();
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
    // ---------- 1️⃣ PRE‑LOAD ALL SKINS ----------
    const canvas = document.getElementById('waveCanvas');
    const fpsEl  = document.getElementById('fps');
    const coinEl = document.getElementById('coins');
    const frqEl = document.getElementById('frq');
    const spdEl = document.getElementById('spd');
    const ampEl = document.getElementById('amp');
    const lvEl = document.getElementById('lvl');
    // instantiate core objects
    const gifMgr   = new GifManager();
    const wave     = new WaveEngine();
    wave.canvasHeight = canvas.height;
    const game     = new GameState();
    const renderer = new Renderer(canvas, gifMgr, wave, game);
    const input    = new InputHandler(game);
    const fpsMeter = utils.createFPSMeter(fpsEl);
    try {
        await Promise.all(CONFIG.skins.map(skin => gifMgr.preload(skin[0])));
    } catch (e) {
        console.error('❌ Pre‑load failed:', e);
        // you can fall back to a placeholder image or abort early
    }
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
        const newLevel = wave.levelFromFreq();

        if (newLevel !== game.level) {
            game.level = newLevel;
            // Still a promise, so we can attach .catch()
            gifMgr.load(CONFIG.skins[newLevel][0])
            .then(() => renderer.updateBackground())
            .catch(console.error);
        }
        obstacles = [];
        game.addObstacle && game.addObstacle(renderer);
    }, 250);

    // ------------------------------------------------------------------
    // Main animation loop (requestAnimationFrame)
    // ------------------------------------------------------------------
    function tick() {
        fpsMeter.tick();          // update FPS display
        coinEl.innerText = game.coins; //debug lines
        frqEl.innerText = wave.freq;
        spdEl.innerText = wave.spd;
        ampEl.innerText = wave.amp;
        lvEl.innerText = game.level; // end of debug lines
        wave.step();              // advance phase
        game.decayJump();         // handle jump decay
        obstacles.forEach((obs, idx) => {
            obs.update(game.speed);                     // move left
            // Remove once completely off‑screen left
            if (obs.x + obs.w < 0) obstacles.splice(idx, 1);
        });
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
