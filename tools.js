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