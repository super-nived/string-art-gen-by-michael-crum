/**
 * COMPUTER VISION
 * Most of this is unused, was added while trying a hough transform approach
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

// https://gist.github.com/xposedbones/75ebaef3c10060a3ee3b246166caab56
const constrain = (val, min, max) => (val < min ? min : (val > max ? max : val))
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
class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

function invert(imgData) {
    var d = imgData;
    for (var i = 0; i < d.length; i += 4) {   //r,g,b,a
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
    }
    return imgData;
}

class Image {
    constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
    };
    // Convert from SVG coords into pixels
    get_image_point(svg_point, bounding_box) {
        let x = Math.floor(map(svg_point.x, bounding_box.x, bounding_box.x + bounding_box.width, 0, this.width - 1));
        let y = Math.floor(map(svg_point.y, bounding_box.y, bounding_box.y + bounding_box.height, 0, this.height - 1));
        return new Point(x, y);
    };
    // Get pixels color average
    get_pixel_weight(point, weight_func) {
        let loc = (point.x + point.y * this.width) * 4;
        return weight_func(new Color(this.data[loc], this.data[loc + 1], this.data[loc + 2], this.data[loc + 3]));
    };
    // Clear pixel (set it to transparent)
    clear_pixel(point) {
        let loc = (point.x + point.y * this.width) * 4;
        this.data[loc] = 0.0;
        this.data[loc + 1] = 0.0;
        this.data[loc + 2] = 0.0;
        this.data[loc + 3] = 0.0;
    };
}

class Line {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    };

    compute_pixel_overlap(image, svg_bounding_box) {
        this.pixels = [];
        // Bresenham algorithm taken from https://stackoverflow.com/a/4672319
        var start_point = image.get_image_point(this.start, svg_bounding_box);
        var end_point = image.get_image_point(this.end, svg_bounding_box);
        var x0 = start_point.x;
        var x1 = end_point.x;
        var y0 = start_point.y;
        var y1 = end_point.y;
        var dx = Math.abs(x1 - x0);
        var dy = Math.abs(y1 - y0);
        var sx = (x0 < x1) ? 1 : -1;
        var sy = (y0 < y1) ? 1 : -1;
        var err = dx - dy;

        let current_point;
        while (true) {
            current_point = new Point(x0, y0);
            this.pixels.push(current_point);

            if ((x0 === x1) && (y0 === y1)) break;
            var e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    };

    point_at(per) {
        let dx = this.end.x - this.start.x;
        let dy = this.end.y - this.start.y;
        return new Point(this.start.x + per * dx, this.start.y + per * dy);
    };

    get_weight(image, weight_func) {
        let total_weight = 0;
        for (var i = 0; i < this.pixels.length; i++) {
            total_weight += image.get_pixel_weight(this.pixels[i], weight_func);
        }
        return total_weight / this.pixels.length;
    };

    clear_line(image) {
        for (var i = 0; i < this.pixels.length; i++) {
            image.clear_pixel(this.pixels[i]);
        }
        return image;
    };
}

class Color {
    constructor(r, g, b, a) {
        this.r = r;
        this.b = b;
        this.g = g;
        this.a = a;
    }
}

// Various weighting functions

// Brightness in grayscale
function grayscale_weight(pixel) {
    let ret = 255.0 - (0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b);
    return ret * (pixel.a / 255);
}

function color_matching_weight(pixel, target) {
    let ret = 255.0 - ((Math.abs(pixel.r - target.r) + Math.abs(pixel.g - target.g) + Math.abs(pixel.b - target.b)) / 3);
    return ret * (pixel.a / 255);
}

let red_matching_weight = function (pixel) { return color_matching_weight(pixel, new Color(255, 255, 255, 255)) };

class Thread {
    constructor(start_nail, color) {
        this.current_nail = start_nail;
        this.color = color;
        this.nail_order = [start_nail];
        this.next_weight = -Infinity;
        this.next_nail;
        this.next_valid = false;
        this.weight_func = function (pixel) { return color_matching_weight(pixel, color) };
    }

    get_next_nail_weight(image) {
        if (this.next_valid) {
            return this.next_weight;
        } else {
            graph.get_connections(this.current_nail, image);
            chords = this.get_connections(current_nail, image);
            chord_weights = chords.map(line => line ? line.get_weight(image, red_matching_weight) : -Infinity);
            let max_weight = -Infinity;
            let max_weight_index;
            for (var i = 0; i < this.num_nails; i++) {
                if (chord_weights[i] > max_weight) {
                    max_weight_index = i;
                    max_weight = chord_weights[i];
                }
            }
            this.next_weight = max_weight;
            this.next_nail = max_weight_index;
            this.next_valid = true;
        }
    }

    move_to_next_nail(image) {
        this.current_nail = this.next_nail;
        this.next_valid = false;
        this.get_next_nail_weight(image);
    }
}

// Create the graph
let graph = {
    init() {
        this.width = 30;
        this.height = this.width;
        this.radius = this.width / 3;
        this.max_itter = 300;

        this.num_nails = 200;
        this.thread_diam = 0.01; // thread width in inches
        this.nail_diam = 0.1;
        this.nail_pos = [];

        this.threads = [new Thread(0, new Color(255, 255, 255, 255))];

        this.threshold = 0.0;

        this.svg = d3.select("body").append("svg")
            .attr("width", "100vw")
            .attr("viewBox", [-this.width / 2, -this.height / 2, this.width, this.height])

        this.svg.append("g");

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
            .style("fill", "none");

        this.frame_bb = frame_path.node().getBBox();

        let nails_lst = [];
        this.nails_pos = [];
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
                this.nails_pos.push(new Point(pos.x, pos.y));
                return `translate(${pos.x}, ${pos.y})`;
            })
            .attr("r", this.nail_diam / 2)
            .attr("fill", "aqua");
    },
    update(image) {
        if (!image) return;
        let string_order = this.parse_image(image);
        let nail_order = string_order.map((pair) => { return { color: pair.color, pos: this.nails_pos[pair] } });
        for (var i = 0; i < nail_order.length; i++) {
            let c = nail_order[i].color;
            let pos = nail_order[i].pos;
            this.svg.select("g")
                .selectAll(`.string_${c}`)
                .data([nail_order])
                .join("path")
                .attr("class", `string_${c}`)
                .attr("d", d3.line(d => d.pos.x, d => d.pos.y))
                .style("stroke", "#FFFFFFA0")
                .style("stroke-width", this.thread_diam)
                .style("fill", "none");

        }
        let strings = this.svg.select("g")
            .selectAll(".strings")
            .data([nail_order])
            .join("path")
            .attr("class", "strings")
            .attr("d", d3.line(d => d.x, d => d.y))
            .style("stroke", "#FFFFFFA0")
            .style("stroke-width", this.thread_diam)
            .style("fill", "none");

        strings.exit()
            .remove();

        this.svg.selectAll("g circle.nail").raise();
    },

    get_settings() {

    },

    // Returns lines connecting the given nail to all other nails
    get_connections(nail_num, image) {
        let ret = [];
        let src = this.nails_pos[nail_num];
        for (var i = 0; i < this.num_nails; i++) {
            if (i === nail_num) {
                ret[i] = null;
                continue;
            };
            let dst = this.nails_pos[i];
            let line = new Line(src, dst);
            line.compute_pixel_overlap(image, this.frame_bb);
            ret[i] = line;
        }
        return ret;
    },

    // Generates a nail order from pixel data
    parse_image(image) {
        let string_order = [];

        let current_nail = 0;

        let chord_weights;
        let chords;
        let thresh_val = this.threshold;
        let used_chords = [];
        for (var i = 0; i < this.num_nails; i++) {
            used_chords[i] = [];
        }
        while (string_order.length < this.max_itter) {
            string_order.push(current_nail)
            chords = this.get_connections(current_nail, image);
            chord_weights = chords.map(line => line ? line.get_weight(image, red_matching_weight) : -Infinity);
            let max_weight = -Infinity;
            let max_weight_index;
            for (var i = 0; i < this.num_nails; i++) {
                if (chord_weights[i] > max_weight) {
                    max_weight_index = i;
                    max_weight = chord_weights[i];
                }
            }
            //if (!thresh_val) thresh_val = max_weight * this.threshold;
            if (max_weight < thresh_val) {
                break;
            }
            image = chords[max_weight_index].clear_line(image);
            current_nail = max_weight_index;
        }
        console.log(string_order);
        return string_order;
    }
};
graph.init();
graph.update();

/**
* IMAGE PROCESSING
 */
const input = document.querySelector("input");

//https://stackoverflow.com/a/37714937
function contrastImage(imgData, contrast) {  //input range [-100..100]
    var d = imgData.data;
    contrast = (contrast / 100) + 1;  //convert to decimal & shift range: [0..2]
    var intercept = 128 * (1 - contrast);
    for (var i = 0; i < d.length; i += 4) {   //r,g,b,a
        d[i] = d[i] * contrast + intercept;
        d[i + 1] = d[i + 1] * contrast + intercept;
        d[i + 2] = d[i + 2] * contrast + intercept;
    }
    return imgData;
}

function grayscale(imgData) {  //input range [-100..100]
    var d = imgData.data;
    for (var i = 0; i < d.length; i += 4) {   //r,g,b,a
        let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = g;
        d[i + 1] = g;
        d[i + 2] = g;
    }
    return imgData;
}

function render_image(url) {
    var img = document.getElementById('snapshot');
    img.onload = () => {
        if (url) URL.revokeObjectURL(img.src);
    }
    if (url)
        img.src = url;
    else
        img.src = img.src;
    img.onload = function () {
        // const canvas = document.createElement("canvas");
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Bunch of sloppy logic to resize the image / canvas to play nice with the frame bounding box.
        // The image is centered and scaled to fill the frame.
        // const max_res = Math.floor(graph.frame_bb.width / graph.thread_diam);
        const max_res = 500;
        let frame_ar = graph.frame_bb.width / graph.frame_bb.height;
        let img_ar = img.width / img.height;
        canvas.width = frame_ar >= 1 ? max_res : max_res * frame_ar;
        canvas.height = frame_ar < 1 ? max_res : max_res / frame_ar;
        let w = frame_ar >= img_ar ? canvas.width : canvas.height * img_ar;
        let h = frame_ar < img_ar ? canvas.height : canvas.width / img_ar;
        ctx.drawImage(img, - (w - canvas.width) / 2, - (h - canvas.height) / 2, w, h);
        const rgba = ctx.getImageData(
            0, 0, canvas.width, canvas.height
        );
        //contrastImage(rgba, 100);
        graph.update(new Image(rgba.data, canvas.width, canvas.height));
    }
}

render_image();

input.addEventListener("change", function () {
    if (this.files && this.files[0]) {
        render_image(URL.createObjectURL(this.files[0]));
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