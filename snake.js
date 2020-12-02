// Snake: The Game
'use strict';

// Global WebGL context variable
let gl;
let coords, indices;

// Allow use of glMatrix values directly instead of needing the glMatrix prefix
const mat4 = glMatrix.mat4;

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
    gl.clearColor(0.07, 0, 0.61, 1.0); // setup the background color with red, green, blue, and alpha amounts
    
    // Initialize the WebGL program and data
    gl.program = initProgram();
    initBuffers();
    initEvents();
    
    gl.uniform4f(gl.program.uLight, 0,0,10,1);
    onWindowResize();
    updateModelViewMatrix();
    updateProjectionMatrix();
    
    // Render the static scene
    render();
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
        uniform vec4 uLight;

        in vec4 aPosition;
        in vec3 aNormal;
        uniform vec4 uPosition;
        
        out vec3 vLightVector;
        out vec3 vNormalVector;
        out vec3 vEyeVector;


        void main() {
            vec4 P = uModelViewMatrix * aPosition;
            vNormalVector = mat3(uModelViewMatrix) * aNormal;
            vLightVector = uLight.w == 1.0 ? P.xyz - uLight.xyz : uLight.xyz;
            vEyeVector = P.xyz;
            gl_Position = uProjectionMatrix * P;
        }`
    );
    // Fragment Shader
    let frag_shader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        in vec3 vNormalVector;
        in vec3 vLightVector;
        in vec3 vEyeVector;

        // Material properties
        const vec3 lightColor = vec3(1.0, 1.0, 1.0);
        const float materialAmbient = 0.6;
        const float materialDiffuse = 0.4;
        const float materialSpecular = 0.6;
        const float materialShininess = 10.0;

        // Fragment base color
        const vec4 vColor = vec4(0.0, 0.75, 0.0, 1.0);

        // Output color of the fragment
        out vec4 fragColor;

        void main() {
            vec3 N = normalize(vNormalVector);
            vec3 L = normalize(vLightVector);
            vec3 E = normalize(vEyeVector);

            float diffuse = dot(-L, N);
            float specular = 0.0;
            if (diffuse < 0.0) {
                diffuse = 0.0;
            } else {
                vec3 R = reflect(L, N);
                specular = pow(max(dot(R, E), 0.0), materialShininess);
            }

            fragColor.rgb = ((materialAmbient + materialDiffuse * diffuse) 
                            * vColor.xyz + materialSpecular * specular) * lightColor;

            fragColor.a = 1.0;
        }`
    );
        
    
    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vert_shader, frag_shader);
    gl.useProgram(program);
    
    // Get the position attribute index
    program.aPosition = gl.getAttribLocation(program, 'aPosition'); // get the vertex shader attribute "aPosition"
    program.aNormal = gl.getAttribLocation(program, 'aNormal');
    
    // Get uniform indeces
    program.uPosition = gl.getUniformLocation(program, 'uPosition');
    program.uLight = gl.getUniformLocation(program, 'uLight');
    program.uProjectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');
    program.uModelViewMatrix = gl.getUniformLocation(program, 'uModelViewMatrix');
        
    return program;
}

/**
 * Initialize the data buffers.
 */
function initBuffers() {

    // Generate Mesh
    let coords = [];
    let indices = [];
    let normals = [];

    // Create and bind VAO
    gl.vao = gl.createVertexArray();
    gl.bindVertexArray(gl.vao);

    // Load the vertex coordinate data onto the GPU and associate with attribute
    let posBuffer = gl.createBuffer(); // create a new buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer); // bind to the new buffer
    gl.bufferData(gl.ARRAY_BUFFER, coords, gl.STATIC_DRAW); // load the data into the buffer
    gl.vertexAttribPointer(gl.program.aPosition, 3, gl.FLOAT, false, 0, 0); // associate the buffer with "aPosition" as length-2 vectors of floats
    gl.enableVertexAttribArray(gl.program.aPosition); // enable this set of data

    // Load the index data onto the GPU
    let indBuffer = gl.createBuffer(); // create a new buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indBuffer); // bind to the new buffer
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint16Array.from(indices), gl.STATIC_DRAW); // load the data into the buffer

    // Load the vertex normal data onto the GPU and associate with attribute
    let normalBuffer = gl.createBuffer(); // create a new buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer); // bind to the new buffer
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW); // load the data into the buffer
    gl.vertexAttribPointer(gl.program.aNormal, 3, gl.FLOAT, false, 0, 0); // associate the buffer with "aNormal" as length-3 vectors of floats
    gl.enableVertexAttribArray(gl.program.aNormal); // enable this set of data

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
}

function initEvents() {
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
}

function onKeyDown(e) {
    
}

/**
 * Updates the model-view matrix with a rotation, translation, scale, and origin.
 */
function updateModelViewMatrix() {
    // Update model-view matrix uniform
    let mv = mat4.create();

}

/**
 * Updates the projection matrix.
 */
function updateProjectionMatrix() {
    let p = mat4.create();
    let aspect = gl.canvas.width / gl.canvas.height;
}

function deg2rad(degrees) {
    return (degrees*Math.PI)/180.0;
}

/**
 * Keep the canvas sized to the window.
 */
function onWindowResize() {
    gl.canvas.width = window.innerWidth;
    gl.canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    updateProjectionMatrix();
}

/**
 * Render the scene.
 */
function render() {
    // Clear the current rendering
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Draw
    gl.bindVertexArray(gl.vao);
    gl.drawElements(gl.TRIANGLE_STRIP,indices.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    window.requestAnimationFrame(render);
}