let jumpHeight = 0;
let jh=0;
let coins = 0;
let level = 0;

colors = [
["./dude_anim_nextgen_2_e.gif", "#000000", [
    [0, "black"], [0.45, "cyan"], [0.5, "white"], [0.55, "cyan"], [1, "black"]
]],
["./dude_anim_nextgen_2_a.gif", "#ff00ff", [
    [0, "black"],[0.45, "purple"], [0.5, "pink"], [0.55, "purple"], [1, "black"]
]],
["./dude_anim_nextgen_2_c.gif", "#ff0000", [
    [0, "black"], [0.45, "red"], [0.5, "white"], [0.55, "red"], [1, "black"]
]],
["./dude_anim_nextgen_2_b.gif", "#00ff00", [
    [0, "black"], [0.45, "green"], [0.5, "white"], [0.55, "green"], [1, "black"]
]],
["./dude_anim_nextgen_2_d.gif", "#0000ff", [
    [0, "black"], [0.45, "blue"], [0.5, "white"], [0.55, "blue"], [1, "black"]
]],
["./dude_anim_nextgen_2_f.gif", "#888888", [
    [0, "black"], [0.45, "grey"], [0.5, "white"], [0.55, "grey"], [1, "black"]
]]
];

powersAndDispowers = ["bonus_0004.png","bonus_0001.png","bonus_0002.png","bonus_0003.png","enemy_spike.gif","checkpoint.png"];
/*-------------------------------------------
 *  1️⃣  Initialise the GIF parser
 *  ------------------------------------------------ */
const myGif = GIF();                     // create the parser object
console.log('🛠️  GIF object created', myGif);
myGif.waitTillDone = false;              // fire onload after the FIRST frame

myGif.onerror = e => console.error('❌ GIF load error:', e);

const incoming = powersAndDispowers.map(i => {
    if (i.includes(".gif")){
        const img = new GIF();
        img.load(i);
        return img;
    }else{
        const img = new Image();
        img.src = i;
        return img;
    }
});
console.log('🛠️  array object created', incoming);
/* ---

function finishGame(){

}

function collectCoin(){
    coins++;
    switch(coins){
        case coins < 10:
            level = 0;
            break;
        case coins < 25:
            level = 1;
            break;
        case coins < 50:
            level = 2;
            break;
        case coins < 100:
            level = 3;
            break;
        case coins < 200:
            level = 4;
            break;
        case coins < 500:
            level = 5;
            break;
        case coins == 500:
            finishGame();
    }
}*/
const imgs = [];
// function spawnImg() {
//     const img = incoming[Math.floor(Math.random() * incoming.length)];
//     const scale = Math.random() * 1 + 0.5;
//     const baseSpeed = 2;                     // pixels per frame
//     const speed = -(baseSpeed / scale);      // negative → leftward
//     const startX = canvas.width + img.width * scale;
//     const offset = Math.random() * Math.PI * 2;
//     imgs.push({ img, x: startX, scale, speed, offset });
// }

/* -------------------------------------------------
 *  2️⃣  Core animation – runs after GIF is ready
 *  ------------------------------------------------ */
function startAnimation() {
    const canvas = document.getElementById('waveCanvas');
    const ctx    = canvas.getContext('2d');
    myGif.load(colors[level][0]);           // <-- adjust path if needed

    canvas.style.backgroundColor = colors[level][1] + "22";
    console.log('🛠️  animation created');
    // -------------------------------------------------
    // If the GIF is tiny you probably want to scale it.
    // Change this factor to suit your art (1 = original size).
    // -------------------------------------------------
    const GIF_SCALE = 1.5;   // e.g. double size – tweak as you like
    const dudeX = 100;     // horizontal position of the surfer

    // Wave parameters – keep them numeric at all times
    let amp = 10,
    freq = 0.01,
    spd = 0.05,
    ph = 0;

    // -------------------------------------------------
    // Optional random‑wave morphing (kept from your earlier code)
    // -----------------------------------------------
    function getRndFloat(min, max) {
        return Math.random() * (max - min) + min;
    }
    function interpolate(cur, tgt, fac) {
        return cur + (tgt - cur) * fac;
    }
    function changeWave() {
        const targetAmp  = getRndFloat(10, 150);
        const targetFreq = getRndFloat(0.001, 0.01);
        const targetSpd = getRndFloat(0.01, 0.1);
        amp  = interpolate(amp,  targetAmp,  0.005);
        freq = interpolate(freq, targetFreq, 0.005);
        spd  = interpolate(spd,  targetSpd,  0.005);
    }
    setInterval(changeWave, 250); // keep the wave morphing


    // -----------------------------------------------
    // The animation loop
    // -------------------------------------------------
    function render() {
        console.log('🔁 render tick – myGif.image?', !!myGif.image);
        // ---- 0️⃣ Guard – make sure the GIF frame exists ----------
        if (!myGif.image) {

            // GIF not ready yet – skip this frame but keep the loop alive
            requestAnimationFrame(render);
            return;
        }

        // ---- 1️⃣ clear the canvas ---------------------------------
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // ---- 2️⃣ draw the sine wave --------------------------------
        for (let x = 0; x < canvas.width; x++) {
            const y  = canvas.height / 2 + amp * Math.sin(freq * x + ph);
            const ny = canvas.height / 2 + amp * Math.sin(freq * (x + 1) + ph);

            let grad = ctx.createLinearGradient(x, y - 20, x, y + 20); // Initial gradient creation

            colors[level][2].forEach(([stop, color]) => {
                grad.addColorStop(stop, color);
            });

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 1, ny);
            ctx.strokeStyle = grad; // Set the line color to the gradient
            ctx.lineWidth = 7;
            ctx.stroke();

        }

        // ---- 3️⃣ compute surfer position & rotation ---------------
        const dudeY  = canvas.height / 2 + amp * Math.sin(freq * dudeX + ph ) ;
        const dudeNY = canvas.height / 2 + amp * Math.sin(freq * (dudeX + 1) + ph );
        const ang   = Math.atan2(dudeNY - dudeY, 1); // slope → rotation

        // ---- 4️⃣ draw the GIF (scaled) -----------------------------
        ctx.save();
        // Translate to the centre of the *scaled* GIF frame
        ctx.translate(
            dudeX ,
                      dudeY - jumpHeight
        );
        ctx.rotate(ang);
        ctx.drawImage(
            myGif.image,
            -(myGif.width * GIF_SCALE) / 2,
                      -(myGif.height * GIF_SCALE),
                      myGif.width * GIF_SCALE,
                      myGif.height * GIF_SCALE
        );
        ctx.restore();

        // ---- 5️⃣ advance the wave ---------------------------------
        ph += spd;
        if (jumpHeight > 0) jumpHeight--;
        // ---- 6️⃣ request next frame --------------------------------
        requestAnimationFrame(render);
    }

    console.log('🚀 Starting animation loop');
    requestAnimationFrame(render);
}
startAnimation();

window.addEventListener('keypress', e => {
    console.log(e.code);
    if (e.code === 'KeyW' || e.code === 'Space' || e.code === 'ArrowUp') {
       if(jumpHeight <= 3) jumpHeight = 60;
    }
});
