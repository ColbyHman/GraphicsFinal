// Snake: The Game


'use strict';
// Constants
const EASY = 0.005;
const MEDIUM = 0.01;
const HARD = 0.05;
const world_color = [0.0, 0.75, 0.0];
const snake_head_color = [0.75, 0.75, 0.75];
const snake_body_color = [0.5, 0.5, 0.5];
const apple_color = [1.0, 0.0, 0.0];

// Global WebGL context variable
let gl;
let coords, indices;

// Allow use of glMatrix values directly instead of needing the glMatrix prefix
const mat4 = glMatrix.mat4;
const vec3 = glMatrix.vec3;

// Snake
let obj;
let world;

let difficulty = EASY;

let position = [0, 0, 0];
let rotation = [0, 0, 0];
let scale = [0.05, 0.05, 0.05];
let snake_mv = mat4.create();

let apple_position = [0, 0, -0.5];
let apple_rotation = [0, 0, 0];
let apple_scale = [0.001, 0.001, 0.001];
let apple_mv = mat4.create();

let world_position = [0, 0, 1];
let world_rotation = [0, 0, 0];
let world_scale = [1, 1, 1];
let world_mv = mat4.create();

let current_direction = "forward";
let snake = []
let score = 0;

let pvm = mat4.create();

let audioContext;
let audio;
let track;
let is_playing = true;


// Once the document is fully loaded run this init function.
window.addEventListener('load', function init() {
    // Get the HTML5 canvas object from it's ID
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) { window.alert('Could not find #webgl-canvas'); return; }

    // Get the WebGL context (save into a global variable)
    gl = canvas.getContext('webgl2');
    if (!gl) { window.alert("WebGL isn't available"); return; }

    // Configure WebGL
    gl.viewport(0, 0, canvas.width, canvas.height); // this is the region of the canvas we want to draw on (all of it)
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // setup the background color with red, green, blue, and alpha amounts
    
    // Initialize the WebGL program and data
    gl.program = initProgram();
    initBuffers();
    initEvents();
    onWindowResize();    

    updateModelViewMatrix(snake_mv, position, rotation, scale);
    updateModelViewMatrix(world_mv, world_position, world_rotation, world_scale);
    updateModelViewMatrix(apple_mv, apple_position, apple_rotation, apple_scale);
    updateProjectionMatrix(pvm);

    // Start music
    // Music Controls Citation: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext
    // Create audio context object
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Connect audio HTML element to JS object
    audio = document.getElementById("audio");
    track = audioContext.createMediaElementSource(audio);
    track.connect(audioContext.destination);

    // Create gain node for volume
    let gainNode = audioContext.createGain();
    track.connect(gainNode).connect(audioContext.destination);
    gainNode.gain.value = 0;

    // Play the audio
    audio.play();


    // Load models and wait for them all to complete
    Promise.all([
        loadModel('apple.json'),
    ]).then(
        models => {
            gl.models = models;
            render();
        }
    );
});

/**
 * Initializes the WebGL program.
 */
function initProgram() {
    // Compile shaders
    // Vertex Shader
    let vert_shader = compileShader(gl, gl.VERTEX_SHADER,
        `#version 300 es
        precision mediump float;

        uniform mat4 uModelViewMatrix;
        uniform mat4 uProjectionMatrix;
        const vec4 light = vec4(0, 10, 0, 1);

        in vec4 aPosition;
        in vec3 aNormal;

        out vec3 vNormalVector;
        out vec3 vLightVector;
        out vec3 vEyeVector;

        void main() {
            vec4 P = uModelViewMatrix * aPosition;
            vNormalVector = mat3(uModelViewMatrix) * aNormal;
            vec4 L = uModelViewMatrix * light;
            vLightVector = light.w == 1.0 ? P.xyz - L.xyz : L.xyz;
            vEyeVector = -P.xyz;
            gl_Position = uProjectionMatrix * P;
        }`
    );
    // Fragment Shader
    let frag_shader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        uniform vec3 uColor;
        // Light and material properties
        const vec3 lightColor = vec3(1.0, 1.0, 1.0);
        const vec3 materialAmbient = vec3(1, 0.2, 0.2);
        const vec3 materialDiffuse = vec3(1, 0.2, 0.2);
        const float materialShininess = 50.0;

        // Vectors (varying variables from vertex shader)
        in vec3 vNormalVector;
        in vec3 vLightVector;
        in vec3 vEyeVector;

        out vec4 fragColor;

        void main() {
            // Normalize vectors
            vec3 N = normalize(vNormalVector);
            vec3 L = normalize(vLightVector);
            vec3 E = normalize(vEyeVector);

            // Compute lighting
            float diffuse = dot(-L, N);
            float specular = 0.0;
            if (diffuse < 0.0) {
                diffuse = 0.0;
            } else {
                vec3 R = reflect(L, N);
                specular = pow(max(dot(R, E), 0.0), materialShininess);
            }
            
            // Compute final color
            fragColor.rgb = lightColor * ((uColor + uColor * diffuse) + specular);
            fragColor.a = 1.0;
        }`
    );
        
    
    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vert_shader, frag_shader);
    gl.useProgram(program);
    
    // Get the position attribute index
    program.aPosition = gl.getAttribLocation(program, 'aPosition'); // get the vertex shader attribute "aPosition"
    program.aNormal = gl.getAttribLocation(program, 'aNormal'); // get the vertex shader attribute "aNormal"
    
    // Get uniform indeces
    program.uPosition = gl.getUniformLocation(program, 'uPosition');
    program.uLight = gl.getUniformLocation(program, 'uLight');
    program.uProjectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');
    program.uModelViewMatrix = gl.getUniformLocation(program, 'uModelViewMatrix');
    program.uColor = gl.getUniformLocation(program, 'uColor');

    return program;
}

/**
 * Initialize the data buffers.
 */
function initBuffers() {
    let cube_coords = [
        1, 1, 1, // A
        -1, 1, 1, // B
        -1, -1, 1, // C
        1, -1, 1, // D
        1, -1, -1, // E
        -1, -1, -1, // F
        -1, 1, -1, // G
        1, 1, -1, // H
    ];
    let cube_indices = [
        1, 2, 0, 2, 3, 0,
        7, 6, 1, 0, 7, 1,
        1, 6, 2, 6, 5, 2,
        3, 2, 4, 2, 5, 4,
        6, 7, 5, 7, 4, 5,
        0, 3, 7, 3, 4, 7,
    ];
    world = createWorld(cube_coords, cube_indices);
    [coords, indices] = unit_sphere();
    let [vao, count] = createObject(coords, indices);
    snake.push([snake_mv, position, vao, count, snake_head_color]);
}

/**
 * Creates a VAO containing the coordinates and indices provided.
 */
function createObject(coords, indices) {
    let normals = coords;
    
    // Create and bind VAO
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Load the coordinate data into the GPU and associate with shader
    let buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, coords, gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aPosition);

    // Load the normal data into the GPU and associate with shader
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aNormal);
    
    // Load the index data into the GPU
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    // Return the object information
    return [vao, indices.length];
}

function initEvents() {
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.getElementById('difficulty').addEventListener('input', updateDifficulty);
}

function changeDirection(direction) {
    if (current_direction === "up" && direction !== "down") {
        rotation[0] -= deg2rad(90);
        return direction;
    } else if (current_direction === "down" && direction !== "up") {
        rotation[0] += deg2rad(90);
        return direction;
    } else if (current_direction === "left" && direction !== "right") {
        rotation[2] -= deg2rad(90);
        return direction;
    } else if (current_direction === "right" && direction !== "left") {
        rotation[2] += deg2rad(90);
        return direction;
    } else if (current_direction === "forward" && direction !== "backward") {
        return direction;
    } else if (current_direction === "backward" && direction !== "forward") {
        return direction;
    }
    return current_direction;
}

/**
 * Updates the score by 5 for every apple eaten.
 */
function updateScore() {
    score += 5;
    document.getElementById("score").innerHTML = score.toString();
}

/**
 * Update the difficulty from HTML inputs.
 */
function updateDifficulty() {
    let difficulty_val = document.getElementById('difficulty').value;
    if (difficulty_val === "easy") {
        difficulty = EASY;
    } else if (difficulty_val === "medium") {
        difficulty = MEDIUM;
    } else {
        difficulty = HARD;
    }
}

/**
 * Creates a sphere, add it to snake (list variable at the top), and make sure it is one sphere distance away
 */
function addToSnake() {
    let last_position = [snake[(snake.length - 1)][1]];
    [coords, indices] = unit_sphere();
    let [vao, count] = createObject(coords, indices);
    let mv = mat4.create();
    moveSnake();
    snake.push([mv, last_position, vao, count, snake_body_color]);
}

/**
 * Move apple to a different position within the bounds of the world
 */
function moveApple(){
    apple_position[0] = (Math.random() * 2) - 1;
    apple_position[1] = (Math.random() * 2) - 1;
    apple_position[2] = (Math.random() * 2) - 1;
}

function eatApple() {
    updateScore();
    moveApple();
    addToSnake();
    moveSnake();
}

// Checks if the snake has come into contact with a wall
function checkForWall() {

    if((position[0] >= 0.99 || position[0] <= -0.99) ||
       (position[1] >= 0.99 || position[1] <= -0.99) ||
       (position[2] >= 0.99 || position[2] <= -0.99)
    ) {
        return true;
    }
    return false;
}

// Checks if snake has come into contact with the apple
function checkForApple(){
    let x_distance = Math.abs(position[0] - apple_position[0]);
    let y_distance = Math.abs(position[1] - apple_position[1]);
    let z_distance = Math.abs(position[2] - apple_position[2]);
    if(x_distance < 0.1 && y_distance < 0.1 && z_distance < 0.1){
        return true;
    }
    return false;
}

function pause(){
    sphere = 1;
}

function onKeyDown(e) {
    if (e.key === "p"){
        pause();
    }
    // When you hit the spacebar then it pauses and unpauses the music.
    if ((e.key === "Spacebar") || (e.key === " ")) {
        if (is_playing) {
            audio.pause();
            is_playing = false;
        } else {
            audio.play();
            is_playing = true;
        }
    }
    // Turn Facing Up
    if (e.key === "w") {
        if (current_direction === "forward") {
            current_direction = changeDirection("up");
        } else if (current_direction === "up") {
            current_direction = changeDirection("backward");
        } else if (current_direction === "backward") {
            current_direction = changeDirection("down");
        } else {
            current_direction = changeDirection("forward");
        }
    }
    // Turn Facing Down
    if (e.key === "s") {
        if (current_direction === "backward") {
            current_direction = changeDirection("down");
        } else if (current_direction === "down") {
            current_direction = changeDirection("forward");
        } else if (current_direction === "up") {
            current_direction = changeDirection("forward");
        } else {
            current_direction = changeDirection("backward");
        }
    }
    // Turn Facing Left
    if (e.key === "a") {
        if (current_direction === "left") {
            current_direction = changeDirection("backward");
        } else if (current_direction === "backward") {
            current_direction = changeDirection("right");
        } else if (current_direction === "right") {
            current_direction = changeDirection("forward");
        } else {
            current_direction = changeDirection("left");        
        }
    }
    // Turn Facing Right
    if (e.key === "d") {
        if (current_direction === "right") {
            current_direction = changeDirection("backward");
        } else if (current_direction === "backward") {
            current_direction = changeDirection("left");
        } else if (current_direction === "left") {
            current_direction = changeDirection("forward");
        } else {
            current_direction = changeDirection("right");     
        }
    }
}


function updateSnakeBody(index, length) {
    if(current_direction === "up" || current_direction === "right")
        for (sphere of snake){
            sphere[index] += length;
        }
    else {
        for (sphere of snake){
            sphere[index] -= length;
        }
    }
}

function moveSnake() { 

    if(!checkForWall()) {
        if(current_direction === "up") {
            position[1] += difficulty;
        } else if (current_direction === "down") {
            position[1] -= difficulty;
        } else if (current_direction === "left") {
            position[0] -= difficulty;
        } else if (current_direction === "right") {
            position[0] += difficulty;
        } else if (current_direction === "backward") {
            position[2] += difficulty;
        } else if (current_direction === "forward") {
            position[2] -= difficulty;
        }
    } else {
        window.alert("Game Over! Your score was " + score + ". Press 'ok' to play again.");
        position = [0,0,0];
        window.location.reload();
    }
}


/**
 * Updates the model-view matrix with a rotation, translation, scale, and origin.
 * These will be changed to one function
 */
function updateModelViewMatrix(mv, position, rotation, scale) {
    // Update model-view matrix uniform
    mv = glMatrix.mat4.fromRotationTranslationScale(mv,
        glMatrix.quat.fromEuler(glMatrix.quat.create(), ...rotation), position, scale);
    gl.uniformMatrix4fv(gl.program.uModelViewMatrix, false, mv);
}

/**
 * Updates the projection matrix.
 */
function updateProjectionMatrix(p) {
    let aspect = gl.canvas.width / gl.canvas.height;
    p = mat4.perspective(p, deg2rad(90), aspect, 0.1, 10);

    let [x, y, z] = position;

    if (current_direction === "up") {
        mat4.lookAt(p, [x, y, z], [x, y, z], [1,0,0]);
    } else if (current_direction === "down") {
        mat4.lookAt(p, [x, y, z], [x, y, z], [-1,0,0]);
    } else if (current_direction === "left") {
        mat4.lookAt(p, [x, y, z], [x, y, z], [0,1,0]);
    } else if (current_direction === "right") {
        mat4.lookAt(p, [x, y, z], [x, y, z], [0,1,0]);
    } else if (current_direction === "forward") {
        mat4.lookAt(p, [x, y, z], [x, y, z], [0,1,0]);
    } else if (current_direction === "backward") {
        mat4.lookAt(p, [x, y, z], [x, y, z], [0,1,0]);
    }

    gl.uniformMatrix4fv(gl.program.uProjectionMatrix, false, p);
}

/**
 * Keep the canvas sized to the window.
 */
function onWindowResize() {
    gl.canvas.width = window.innerWidth;
    gl.canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    updateProjectionMatrix(pvm);
}

/**
 * Render the scene.
 */
function render() {
    if(checkForApple()){
        eatApple();
    }
    moveSnake();
    // updateSnakeBody();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    
    gl.uniform3f(gl.program.uColor, ...world_color);
    let [vao, count] = world;
    gl.bindVertexArray(vao);
    updateModelViewMatrix(world_mv, world_position, world_rotation, world_scale);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    
    gl.uniform3f(gl.program.uColor, ...apple_color);
    for (let [vao, count] of gl.models) {
        gl.bindVertexArray(vao);
        updateModelViewMatrix(apple_mv ,apple_position, apple_rotation, apple_scale);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
    }
    
    for (let [mv, sphere_position, vao, count, color] of snake) {
        gl.bindVertexArray(vao);
        updateModelViewMatrix(mv, sphere_position, rotation, scale);
        gl.uniform3f(gl.program.uColor, ...color);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
    }
    updateProjectionMatrix(pvm);
    
    window.requestAnimationFrame(render);
}
