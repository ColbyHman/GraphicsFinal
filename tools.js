function deg2rad(degrees) {
    return (degrees*Math.PI)/180.0;
}

/**
 * Create an approximate unit sphere by subdividing the faces of a tetrahedron repeatedly. The
 * sphere will be centered at the origin and have a radius of 1. For different spheres the
 * vertices can just be transformed as necessary.
 * 
 * Returns the Float32Array of 3-element coordinates and Uint16Array of indices. The coordinates
 * are the same as the normals so that can just be reused.
 * 
 * Number of subdivisions is the only parameter and defaults to 7 which means that 65,536 triangles
 * are used to approximate the sphere which is the highest quality sphere this can generate. A
 * value of 0 would just give a tetrahedron (4 triangles) and 1 would give a 16-sided shape.
 */
function unit_sphere(num_subdivisions) {
    if (typeof num_subdivisions === "undefined") { num_subdivisions = 7; }

    let num_triangles = Math.pow(4, num_subdivisions); // number of triangles per face of tetrahedron
    let indices = new Uint16Array(12 * num_triangles);
    let coords = new Float32Array(6 * num_triangles + 6); // see https://oeis.org/A283070
    let indices_pos = 0, coords_pos = 0; // current position in each of the arrays
    let map = new Map();

    /**
     * Gets the index of the coordinate c. If c already exists than its previous index is
     * returned otherwise c is added and its new index is returned. The whole point of this
     * function (and the map variable) is so that duplicate coordinates get merged into a single
     * vertex.
     */
    function add_coord(c) {
        let str = c.toString();
        if (!map.has(str)) {
            map.set(str, coords_pos);
            coords.set(c, coords_pos*3);
            coords_pos++;
        }
        indices[indices_pos++] = map.get(str);
    }

    /**
     * Recursive function to continually divide a triangle similar to the Sierpinski's triangle
     * recursive function.
     */
    function divide_triangle(a, b, c, n) {
        if (n === 0) {
            // Base case: add the triangle
            add_coord(b);
            add_coord(a);
            add_coord(c);
        } else {
            // Get the midpoints
            let ab = vec3.lerp(vec3.create(), a, b, 0.5);
            let ac = vec3.lerp(vec3.create(), a, c, 0.5);
            let bc = vec3.lerp(vec3.create(), b, c, 0.5);

            // Recursively divide
            divide_triangle(a, ab, ac, n-1);
            divide_triangle(ab, b, bc, n-1);
            divide_triangle(ac, bc, c, n-1);
            divide_triangle(ab, bc, ac, n-1);
        }
    }

    // Initial tetrahedron to be divdied, 4 equidistant points at approximately:
    //    <0,0,-1>, <0,2*√2/3,1/3>, <-√6/3, -√2/3, 1/3>, and <√6/3, -√2/3, 1/3>
	let a = vec3.fromValues(0.0, 0.0, -1.0);
	let b = vec3.fromValues(0.0, 0.94280904158, 0.33333333333);
	let c = vec3.fromValues(-0.81649658093, -0.4714045207, 0.33333333333);
	let d = vec3.fromValues( 0.81649658093, -0.4714045207, 0.33333333333);
    
    // Subdivide each face of the tetrahedron
	divide_triangle(a, b, c, num_subdivisions);
	divide_triangle(d, c, b, num_subdivisions);
	divide_triangle(a, d, b, num_subdivisions);
    divide_triangle(a, c, d, num_subdivisions);

    // Normalize each vertex so that it is moved to the surface of the unit sphere
	for (let i = 0; i < coords.length; i += 3) {
        let coord = coords.subarray(i, i+3);
        vec3.normalize(coord, coord);
    }

    return [coords, indices];
}

/**
 * Load a model from a file into a VAO and return the VAO.
 */
function loadModel(filename) {
    return fetch(filename)
        .then(r => r.json())
        .then(raw_model => {
            // Create and bind the VAO
            let vao = gl.createVertexArray();
            gl.bindVertexArray(vao);

            let vertices = Float32Array.from(raw_model.vertices);
            
            // Load the vertex coordinate data onto the GPU and associate with attribute
            let posBuffer = gl.createBuffer(); // create a new buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer); // bind to the new buffer
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW); // load the data into the buffer
            gl.vertexAttribPointer(gl.program.aPosition, 3, gl.FLOAT, false, 0, 0); // associate the buffer with "aPosition" as length-3 vectors of floats
            gl.enableVertexAttribArray(gl.program.aPosition); // enable this set of data
            
            // Load the vertex normal data onto the GPU and associate with attribute
            let normals = calc_normals(vertices, raw_model.indices);
            let normBuffer = gl.createBuffer(); // create a new buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer); // bind to the new buffer
            gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW); // load the data into the buffer
            gl.vertexAttribPointer(gl.program.aNormal, 3, gl.FLOAT, false, 0, 0); // associate the buffer with "aPosition" as length-3 vectors of floats
            gl.enableVertexAttribArray(gl.program.aNormal); // enable this set of data

            // Load the index data onto the GPU
            let indBuffer = gl.createBuffer(); // create a new buffer
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indBuffer); // bind to the new buffer
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint16Array.from(raw_model.indices), gl.DYNAMIC_DRAW); // load the data into the buffer
            
            // Cleanup
            gl.bindVertexArray(null);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

            // Return the VAO and number of indices
            return [vao, raw_model.indices.length];
        })
        .catch(console.error);
}

/**
 * Calculates the normals for the vertices given an array of vertices and array of indices to look
 * up into. The triangles are full triangles and not triangle strips.
 * The positions array must be a Float32Array with 3 values per vertex.
 * The indices can be a regular array or a typed array.
 * This returns a Float32Array of the normals with 3 values per vertex.
 */
function calc_normals(positions, indices) {
    // Start with all vertex normals as <0,0,0>
    let normals = new Float32Array(positions.length);

    // Allocate temporary variables
    let N_face = glMatrix.vec3.create();
    let V = glMatrix.vec3.create();
    let U = glMatrix.vec3.create();

    // Calculate the face normals for each triangle then add them to the vertices
    for (let i = 0; i < indices.length - 2; i += 3) {
        // Get the indices of the triangle and then get pointers its positions and normals
        let j = indices[i]*3, k = indices[i+1]*3, l = indices[i+2]*3;
        let A = positions.subarray(j, j+3), B = positions.subarray(k, k+3), C = positions.subarray(l, l+3);
        let NA = normals.subarray(j, j+3), NB = normals.subarray(k, k+3), NC = normals.subarray(l, l+3);

        // TODO: Compute normal for the A, B, C triangle and save to N_face (will need to use V and U as temporaries as well)
        glMatrix.vec3.subtract(V, B, A);
        glMatrix.vec3.subtract(U, C, A);
        glMatrix.vec3.cross(N_face, V, U);
        
        // TODO: Add N_face to the 3 normals of the triangle: NA, NB, and NC
        glMatrix.vec3.add(NA, N_face, NA);
        glMatrix.vec3.add(NB, N_face, NB);
        glMatrix.vec3.add(NC, N_face, NC);

    }

    // Normalize the normals
    for (let i = 0; i < normals.length; i+=3) {
        let N = normals.subarray(i, i+3);
        glMatrix.vec3.normalize(N, N);
    }

    // Return the computed normals
    return normals;
}

function createWorld(coords, indices) {
    coords = Float32Array.from(coords);
    let normals = calc_normals(coords, indices);

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
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint16Array.from(indices), gl.STATIC_DRAW);

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    // Return the object information
    return [vao, indices.length];
}
