/**
 * IMAGE PROCESSING
 */

//These get transposed in the code, which is why the might look unintuitive
let sobel_dy_kernel = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1]
];

let sobel_dx_kernel = [
    [1, 2, 1],
    [0, 0, 0],
    [-1, -2, -1]
];

function constrain(val, min, max) {
    return val < min ? min : (val > max ? max : val); // ew 
}

// https://gist.github.com/xposedbones/75ebaef3c10060a3ee3b246166caab56
const map = (value, x1, y1, x2, y2) => (value - x1) * (y2 - x2) / (y1 - x1) + x2;

// Based on Dan Shiffman's implementation of convolution (https://p5js.org/examples/image-convolution.html)
// Edited to port to my implementation

function convolve(kernel, img) {
    let copy = img.data.slice();
    for (var x = 0; x < img.width; x++) {
        for (var y = 0; y < img.height; y++) {
            let loc = (x + y * img.width) * 4;
            let pixel = convolve_pixel(x, y, kernel, img);
            copy[loc] = pixel[0];
            copy[loc + 1] = pixel[1];
            copy[loc + 2] = pixel[2];
        }
    }
    return copy;
}

function convolve_pixel(x, y, kernel, img) {
    let matrixsize = kernel.length;
    let rtotal = 0.0;
    let gtotal = 0.0;
    let btotal = 0.0;
    const offset = Math.floor(matrixsize / 2);
    for (let i = 0; i < matrixsize; i++) {
        for (let j = 0; j < matrixsize; j++) {
            // What pixel are we testing
            const xloc = x + i - offset;
            const yloc = y + j - offset;
            let loc = (xloc + img.width * yloc) * 4;

            // Make sure we haven't walked off our image, we could do better here
            loc = constrain(loc, 0, img.data.length - 1);

            // Calculate the convolution
            // retrieve RGB values
            rtotal += img.data[loc] * kernel[i][j];
            gtotal += img.data[loc + 1] * kernel[i][j];
            btotal += img.data[loc + 2] * kernel[i][j];
        }
    }
    // Return the resulting color
    return [rtotal, gtotal, btotal];
}

// Return the gradient magnitude image
function gradient_mag(img) {
    let ret = [];
    for (var y = 0; y < img.height; y++) {
        for (var x = 0; x < img.width; x++) {
            let loc = (x + y * img.width) * 4;
            let r = img.data[loc] ** 2;
            let g = img.data[loc + 1] ** 2;
            let b = img.data[loc + 2] ** 2;
            ret.push(Math.sqrt(r + g + b));
        }
    }
    return ret;
}

/**
 * GRAPHING
 */

let point = {
    point(x, y) {
        this.x = x;
        this.y = y;
    }
}

let line = {
    line(start, end) {
        this.start = start;
        this.end = end;
    },

    point_at(per) {
        let dx = this.end.x - this.start.x;
        let dy = this.end.y - this.start.y;
        return point(this.start.x + per * dx, this.start.y + per * dy);
    }
}

// Create the graph
let graph = {
    init() {
        this.width = 30;
        this.height = this.width;
        this.radius = this.width / 4;

        this.num_nails = 200;
        this.thread_diam = 0.01; // thread width in inches
        this.nail_diam = 0.1;

        this.svg = d3.select("body").append("svg")
            .attr("width", "100vw")
            .attr("height", "100vh")
            .attr("viewBox", [-this.width / 2, -this.height / 2, this.width, this.height])
            .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

        this.svg.append("g");
    },
    update(pixels) {
        // let frame_path = this.svg.select("g")
        //     .append("circle")
        //     .attr("r", this.radius)
        //     .style("stroke", "#ffbe5700")
        //     .style("stroke-width", 10)
        //     .style("fill", "none")

        let frame_path = this.svg.append("g")
            .append("rect")
            .attr("width", this.radius * 2)
            .attr("height", this.radius * 2)
            .attr("x", -this.radius)
            .attr("y", -this.radius)
            .style("stroke", "#ffbe5700")
            .style("stroke-width", 0.5)
            .style("fill", "none")

        this.frame_bb = frame_path.node().getBBox();

        let nails_lst = []
        let nails_pos = []
        for (let i = 0; i < this.num_nails; i++) {
            nails_lst.push(i);
        }
        let frame_length = frame_path.node().getTotalLength();

        // Append nails evenly around the frame, and store their locations in a list
        let nails = this.svg.select("g")
            .selectAll("circle.nail")
            .data(nails_lst)
            .join("circle")
            .attr("class", "nail")
            .attr("transform", (d) => {
                let pos = frame_path.node().getPointAtLength((d / this.num_nails) * frame_length);
                nails_pos.push(pos);
                return `translate(${pos.x}, ${pos.y})`;
            })
            .attr("r", this.nail_diam / 2)
            .attr("fill", "aqua");

        if (!pixels) return;
        string_order = this.parse_image(pixels);
        let nail_order = string_order.map((num) => nails_pos[num]);
        let strings = this.svg.select("g")
            .selectAll("strings")
            .data([nail_order]);
        strings.enter()
            .append("path")
            .attr("class", "strings")
            .merge(strings)
            .attr("d", d3.line(d => d.x, d => d.y))
            .style("stroke", "white")
            .style("stroke-width", this.thread_diam)
            .style("fill", "none");

        this.svg.selectAll("g circle.nail").raise();
    },

    get_complete_graph(nail_pos) {
        let ret = [];
        for (var a = 0; a < this.num_nails - 1; a++) {
            for (var b = a + 1; b < this.num_nails; b++) {
                ret.push([nails_pos[a], nails_pos[b]]);
            }
        }
        return ret;
    },

    get_chord_weight(image, start, end) {

        return 1.0;
    },

    point_along_line() {

    },

    svg_to_image_coord(x, y) {

    },

    // Generates a nail order from pixel data
    parse_image(pixels) {
        let string_order = [];

        let chord_weights = {};



        for (var i = 0; i < 1000; i++) {
            string_order.push(Math.floor(Math.random() * this.num_nails))
        }

        return string_order;
    }
};
graph.init();
graph.update();

// Image input
const input = document.querySelector("input");

input.addEventListener("change", function () {
    if (this.files && this.files[0]) {
        var img = document.getElementById('snapshot');
        img.onload = () => {
            URL.revokeObjectURL(img.src);
        }
        img.src = URL.createObjectURL(this.files[0]);
        img.onload = function () {
            // const canvas = document.createElement("canvas");
            const canvas = document.getElementById("test");
            const ctx = canvas.getContext('2d');

            // Bunch of sloppy logic to resize the image / canvas to play nice with the frame bounding box.
            // The image is centered and scaled to fill the frame.
            const max_res = 500;
            let frame_ar = graph.frame_bb.width / graph.frame_bb.height;
            let img_ar = img.width / img.height;
            canvas.width = frame_ar >= 1 ? max_res : max_res * frame_ar;
            canvas.height = frame_ar < 1 ? max_res : max_res / frame_ar;
            let w = frame_ar >= img_ar ? canvas.width : canvas.height * img_ar;
            let h = frame_ar < img_ar ? canvas.height : canvas.width / img_ar;
            ctx.drawImage(img, - (w - canvas.width) / 2, - (h - canvas.height) / 2, w, h);
            const rgba = ctx.getImageData(
                - (w - canvas.width) / 2, - (h - canvas.height) / 2, w, h
            );
            let grayscale = [];
            for (var i = 0; i < rgba.data.length; i += 4) {
                let g = 0.299 * rgba.data[i] + 0.587 * rgba.data[i + 1] + 0.114 * rgba.data[i + 2];
                rgba.data[i] = g;
                rgba.data[i + 1] = g;
                rgba.data[i + 2] = g;
                grayscale.push(g);
            }

            ctx.putImageData(rgba, -(w - canvas.width) / 2, -(h - canvas.height) / 2);
            graph.update(grayscale);
        }
    }
})

/**
 * MISC
 */

// Hide UI if query param is present
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("showUI") === "false") {
    document.getElementById("ui").style.display = "none";
}

// Handle zooming and panning
let zoom = d3.zoom().on('zoom', handleZoom);

function handleZoom(e) {
    d3.selectAll('svg g')
        .attr('transform', e.transform);
}

d3.select('svg').call(zoom);