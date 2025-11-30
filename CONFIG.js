/* ------------------------------------------------------------
 C onfiguration – colours / skins                                   *
 -------------------------------------------------------------- */

/* ------------------------------------------------------------------
 1 ️⃣  Define the reusable parts first                              *
 ------------------------------------------------------------------ */
const SKINS = [
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
];

const OBJECTS = {
    coin:      "./bonus_0003.png",
    spike:     "./enemy_spike.gif",
    slowdown:  "./bonus_0004.png",
    speedup:   "./bonus_0002.png",
    tempPause: "./bonus_0001.png",
    life:      "./bonus_0005.png"
};

/* ------------------------------------------------------------------
 2 ️⃣  Build the LEVEL_TABLE – now we can safely reference OBJECTS  *
 ------------------------------------------------------------------ */
const LEVEL_TABLE = [
    // level 0
    [
        { obj: OBJECTS.coin,      weight: 1 },
{ obj: null,              weight: 1 },   // “do nothing”
{ obj: OBJECTS.spike,     weight: 1 }
    ],

// level 1
[
    { obj: OBJECTS.coin,      weight: 1 },
{ obj: null,              weight: 2 },
{ obj: OBJECTS.spike,     weight: 1 },
{ obj: OBJECTS.slowdown,  weight: 1 }
],

// level 2
[
    { obj: OBJECTS.coin,      weight: 1 },
{ obj: null,              weight: 2 },
{ obj: OBJECTS.spike,     weight: 2 },
{ obj: OBJECTS.slowdown,  weight: 1 },
{ obj: OBJECTS.speedup,   weight: 1 }
],

// level 3
[
    { obj: OBJECTS.coin,      weight: 2 },
{ obj: null,              weight: 2 },
{ obj: OBJECTS.spike,     weight: 2 },
{ obj: OBJECTS.slowdown,  weight: 1 },
{ obj: OBJECTS.speedup,   weight: 1 },
{ obj: OBJECTS.life,      weight: 1 }
],

// level 4
[
    { obj: OBJECTS.coin,      weight: 2 },
{ obj: null,              weight: 2 },
{ obj: OBJECTS.spike,     weight: 2 },
{ obj: OBJECTS.slowdown,  weight: 1 },
{ obj: OBJECTS.speedup,   weight: 2 },
{ obj: OBJECTS.life,      weight: 1 },
{ obj: OBJECTS.tempPause, weight: 1 }
],

// level 5
[
    { obj: OBJECTS.coin,      weight: 1 },
{ obj: null,              weight: 2 },
{ obj: OBJECTS.spike,     weight: 3 },
{ obj: OBJECTS.slowdown,  weight: 2 },
{ obj: OBJECTS.speedup,   weight: 2 },
{ obj: OBJECTS.life,      weight: 1 },
{ obj: OBJECTS.tempPause, weight: 1 }
]
];

/* ------------------------------------------------------------------
 3 ️⃣  Assemble the final configuration object                      *
 ------------------------------------------------------------------ */
const CONFIG = {
    skins: SKINS,
    objects: OBJECTS,
    LEVEL_TABLE: LEVEL_TABLE
};

export default CONFIG;
