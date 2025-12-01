import CONFIG from './CONFIG.js';

let obstacles = [];

let morphTimer = null;
let obstacleTimer = null;

/* --------------------------------------------------------
 1 ️smaller utils *
 -------------------------------------------------------------- */
const utils = {
    rndFloat(min, max) { return Math.random() * (max - min) + min; },

    lerp(cur, tgt, fac) { return cur + (tgt - cur) * fac; },

    /** Simple FPS logger – writes to #fps element, if one exists - aka - app is not in debug mode */
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

/* -------------------------------------------------
 *  2 GifManager – returns a sprite whose image updates *
 *  automatically as the GIF plays. *
 *  ------------------------------------------------ */
class GifManager {
    constructor() {
        this.cache   = new Map();
        this.current = null;
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
                gif.play();
                const sprite = {
                    get image() { return gif.image; },
                           get width()  { return gif.width; },
                           get height() { return gif.height; },
                           /* Expose the raw gif object if you ever need it */
                           _gif: gif
                };

                this.cache.set(url, sprite);
                resolve(sprite);
            };
            gif.onerror = reject;
            gif.load(url);
        });
    }

    async load(url) {
        const sprite = await this.preload(url);
        this.current = sprite;
        return sprite;
    }

    /** Renderer accesses this */
    get sprite() { return this.current; }
}

/* -------------------------------------------
 3 ️ Wave engine – holds amplitude/frequency/speed and morphs them *
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
 *  4 Obstacle – holds image, position and simple movement *
 *  ------------------------------------------------------- */
class Obstacle {
    constructor(imgUrl, x) {
        this.url = imgUrl;
        this.type = Object.keys(CONFIG.objects).find(k => CONFIG.objects[k] === imgUrl);
        this.x = x;                  // start X (off‑screen right)
        this.loaded = false;
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
    draw(ctx, wave, dudeX) {
        if (!this.loaded) return;

        // Compute Y exactly like the surfer does (wave height at this X)
        const y = wave.canvasHeight / 2 +
        wave.amp * Math.sin(wave.freq * this.x + wave.phase);

        // Optional: rotate to match wave slope (like surfer)
        const ny = wave.canvasHeight / 2 +
        wave.amp * Math.sin(wave.freq * (this.x + 1) + wave.phase);
        const angle = Math.atan2(ny - y, 1);

        ctx.save();
        ctx.translate(this.x, y -14);
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
    getBox(wave) {
        const y = wave.canvasHeight / 2 +
        wave.amp * Math.sin(wave.freq * this.x + wave.phase);
        return {
            x: this.x - this.w / 2,
            y: y - this.h,
            w: this.w,
            h: this.h
        };
    }
}

/* -------------------------------------------
 5 ️*⃣ Game state – coins, level, pause, jump , etc… *
 -------------------------------------------------------------- */
class GameState {
    constructor() {
        this.lifes = 5;
        this.coins = 0;
        this.level = 0;
        this.playing = true;
        this.jumpMaxHeight = 75;
        this.jumpHeight = 0;
        this.jumped = false;
        this.speed = 1;
        this._morphTimer    = null;
        this._obstacleTimer = null;
    }

    collectCoin() {
        ++this.coins;
        // exactly 500 → win
        //if (this.coins === 500) this.finishGame("won");
    }

    slowdown(){
        this.speed -= this.speed * 0.001;
    }

    speedup(){
        this.speed += this.speed * 0.001;
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
        if (this.jumped && this.jumpHeight < this.jumpMaxHeight){
            this.jumpHeight +=1;
        }else if(this.jumped && this.jumpHeight >= this.jumpMaxHeight){
            this.jumped = false;
            this.jumpHeight -=1;
        }else if (this.jumpHeight >= 1 && !this.jumped){
            this.jumpHeight -=1;
        }
    }

    /** Decay the jump height each frame */
    decayJump() {
        if (this.jumpHeight > 0) this.jumpHeight--;
    }

    /** Toggle pause – fixed version (no double‑press) */
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
    // Helper: pick a random entry from an array of {obj, weight}
    weightedPick(choices) {
        const total = choices.reduce((s, c) => s + c.weight, 0);
        let r = Math.random() * total;
        for (const c of choices) {
            if ((r -= c.weight) < 0) return c.obj;
        }
    }
    addObstacle(renderer) {
        // Only add when we have room for another obstacle
        if (obstacles.length >= 1) return;

        const choices = CONFIG.LEVEL_TABLE[this.level] || [];
        const picked = this.weightedPick(choices);

        // If the choice is null we intentionally skip adding anything
        if (!picked) return;

        obstacles.push(new Obstacle(picked, renderer.canvas.width + 50));
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
        this.jumpHeight;

        const surferBox = {
            x: dudeX - (sprite.width * GIF_SCALE) / 2,
            y: surferBottomY - (sprite.height * GIF_SCALE),
            w: sprite.width * GIF_SCALE,
            h: sprite.height * GIF_SCALE
        };

        // Test each obstacle’s box
        for (const obs of obstacles) {
            if (this.rectOverlap(surferBox, obs.getBox(wave, this.jumpHeight))) {
                return obs;               // <-- return the colliding obstacle
            }
        }
        return null;
    }
    startTimers(gifMgr, wave, renderer) {
        // wave‑morph timer
        this._morphTimer = setInterval(() => {
            wave.morph();
            const lvl = wave.levelFromFreq();
            if (lvl !== this.level) {
                this.level = lvl;
                gifMgr.load(CONFIG.skins[lvl][0])
                .then(() => renderer.updateBackground())
                .catch(console.error);
            }
        }, 250);

        // obstacle‑spawn timer (uses current wave speed)
        const scheduleObstacles = () => {
            const interval = wave.spd * 10000;
            this._obstacleTimer = setInterval(() => {
                this.addObstacle && this.addObstacle(renderer);
            }, interval);
        };
        scheduleObstacles();

        // keep a reference so we can re‑schedule if wave.spd changes
        this._recalcObstacleTimer = () => {
            clearInterval(this._obstacleTimer);
            scheduleObstacles();
        };
    }

    stopTimers() {
        clearInterval(this._morphTimer);
        clearInterval(this._obstacleTimer);
        this._morphTimer = this._obstacleTimer = null;
    }

    /* ----------------------------------------------------------
     *      NEW: togglePause – uses the instance helpers
     *      ---------------------------------------------------------- */
    togglePause(gifMgr, wave, renderer) {
        this.playing = !this.playing;
        if (this.playing) {
            this.startTimers(gifMgr, wave, renderer);
        } else {
            this.stopTimers();
        }
    }

    /* ----------------------------------------------------------
     *      OPTIONAL: expose a helper for temporary‑pause items
     *      ---------------------------------------------------------- */
    temporaryPause(durationMs, gifMgr, wave, renderer) {
        if (!this.playing) return;               // already paused → ignore
        this.togglePause(gifMgr, wave, renderer); // pause
        setTimeout(() => {
            this.togglePause(gifMgr, wave, renderer); // resume after delay
        }, durationMs);
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
    constructor(state,gifMgr,wave,renderer) {
        this.state = state;
        this.gifMgr  = gifMgr;
        this.wave    = wave;
        this.renderer= renderer;
        this.bind();
    }

    bind() {
        window.addEventListener('keydown', e => {
            const code = e.code;
            console.log(code);

            // Jump keys
            if (['KeyW', 'Space', 'ArrowUp'].includes(code)) {
                this.state.jumped = true;
                this.state.triggerJump();
                return;
            }

            // Pause / resume – CapsLock (fixed!)
            if (code === 'CapsLock') {
                this.state.togglePause(this.gifMgr,this.wave,this.renderer);
                return;
            }
        });
        document.getElementById("waveCanvas").addEventListener('click', e =>{
            this.state.jumped = true;
            this.state.triggerJump();
            return;
        })
    }
}

// GameState.prototype.togglePause = function () {
//     this.playing = !this.playing;
//     if (this.playing) startTimers(); else stopTimers();
// };

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
    const lifeEl = document.getElementById("life");
    // instantiate core objects
    const gifMgr   = new GifManager();
    const wave     = new WaveEngine();
    wave.canvasHeight = canvas.height;
    const game     = new GameState();
    const renderer = new Renderer(canvas, gifMgr, wave, game);
       const input    = new InputHandler(game, gifMgr, wave, renderer);
    const fpsMeter = utils.createFPSMeter(fpsEl);
    let morphTimer   = null;
    let obstacleTimer = null;
    function startTimers() {
        morphTimer = setInterval(() => {
            wave.morph();
            const lvl = wave.levelFromFreq();
            if (lvl !== game.level) {
                game.level = lvl;
                gifMgr.load(CONFIG.skins[lvl][0])
                .then(() => renderer.updateBackground())
                .catch(console.error);
            }
        }, 250);

        obstacleTimer = setInterval(() => {
            game.addObstacle && game.addObstacle(renderer);
        }, wave.spd * 10000);
    }
    function stopTimers() {
        clearInterval(morphTimer);
        clearInterval(obstacleTimer);
        morphTimer = obstacleTimer = null;
    }
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

    startTimers();
    if(!game.playing){return;}

    function tick() {
        if (game.playing) {
        fpsMeter.tick();          // update FPS display
        coinEl.innerText = game.coins; //debug lines
        lifeEl.innerText = game.lifes;
        frqEl.innerText = wave.freq;
        spdEl.innerText = wave.spd;
        ampEl.innerText = wave.amp;
        lvEl.innerText = game.level; // end of debug lines
        wave.step();              // advance phase
        game.triggerJump();         // handle jump decay
        obstacles.forEach((obs, idx) => {
            obs.update(game.speed);                     // move left
            // Remove once completely off‑screen left
            if (obs.x + obs.w < 0) obstacles.splice(idx, 1);
        });
            const hit = game.checkCollision(renderer, wave, game);
            if (hit) {
                // ----------  HANDLE EACH TYPE -------------
                switch (hit.type) {
                    case 'spike':
                        if (game.lifes > 0){
                            game.lifes--;
                        }else{
                            game.finishGame('dead');
                            game.stopTimers();
                            return;
                        }
                        console.log('💥 Spike!');          // death
                    case 'coin':
                        console.log('🪙 Coin collected');
                        game.collectCoin();                // already increments & levels
                        break;
                    case 'slowdown':
                        console.log('🐢 Slowdown');
                        game.slowdown();
                        break;
                    case 'speedup':
                        console.log('⚡ Speed‑up');
                        game.speedup();
                        break;
                    case 'tempPause':
                        console.log('⏸️ Temporary pause');
                        //game.togglePause();                // or a custom pause timer
                        game.temporaryPause(5000, gifMgr, wave, renderer);
                        break;
                    case 'life':
                        game.lifes++;
                        console.log('life added');
                        // Save the current wave parameters so you can restore later
                        //game.saveCheckpoint(wave.amp, game.speed, wave.phase, wave.freq);
                        break;
                    default:
                        console.warn('Unknown obstacle type:', hit.type);
                }
                // After handling, optionally remove the obstacle so it isn’t hit again
                const idx = obstacles.indexOf(hit);
                if (idx !== -1) obstacles.splice(idx, 1);
            }
        }
        renderer.render();        // draw everything
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
})();
