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

    get_weight_cache(cache) {
        let total_weight = 0;
        for (var i = 0; i < this.pixels.length; i++) {
            total_weight += cache[this.pixels[i].y][this.pixels[i].x];
        }
        return total_weight / this.pixels.length;
    };

    clear_line(image) {
        for (var i = 0; i < this.pixels.length; i++) {
            image.clear_pixel(this.pixels[i]);
        }
        return image;
    };

    clear_cache_line() {
        for (var i = 0; i < graph.threads.length; i++) {
            let thread = graph.threads[i];
            for (var j = 0; j < this.pixels.length; j++) {
                thread.pixels_cache[this.pixels[j].y][this.pixels[j].x] = 0.0;
            }
        }
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

function deltaE(rgbA, rgbB) {
    let labA = rgb2lab(rgbA);
    let labB = rgb2lab(rgbB);
    let deltaL = labA[0] - labB[0];
    let deltaA = labA[1] - labB[1];
    let deltaB = labA[2] - labB[2];
    let c1 = Math.sqrt(labA[1] * labA[1] + labA[2] * labA[2]);
    let c2 = Math.sqrt(labB[1] * labB[1] + labB[2] * labB[2]);
    let deltaC = c1 - c2;
    let deltaH = deltaA * deltaA + deltaB * deltaB - deltaC * deltaC;
    deltaH = deltaH < 0 ? 0 : Math.sqrt(deltaH);
    let sc = 1.0 + 0.045 * c1;
    let sh = 1.0 + 0.015 * c1;
    let deltaLKlsl = deltaL / (1.0);
    let deltaCkcsc = deltaC / (sc);
    let deltaHkhsh = deltaH / (sh);
    let i = deltaLKlsl * deltaLKlsl + deltaCkcsc * deltaCkcsc + deltaHkhsh * deltaHkhsh;
    return i < 0 ? 0 : Math.sqrt(i);
}

function rgb2lab(rgb) {
    let r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, x, y, z;
    r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    x = (x > 0.008856) ? Math.pow(x, 1 / 3) : (7.787 * x) + 16 / 116;
    y = (y > 0.008856) ? Math.pow(y, 1 / 3) : (7.787 * y) + 16 / 116;
    z = (z > 0.008856) ? Math.pow(z, 1 / 3) : (7.787 * z) + 16 / 116;
    return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)]
}

function color_matching_weight(pixel, target, bias) {
    return (100 - deltaE([pixel.r, pixel.g, pixel.b], [target.r, target.g, target.b])) * (pixel.a / 255) * bias;
}


class Thread {
    constructor(start_nail, color, bias) {
        this.current_nail = start_nail;
        this.color = color;
        this.nail_order = [start_nail];
        this.next_weight = -Infinity;
        this.next_nail;
        this.next_valid = false;
        this.next_line;
        this.weight_func = function (pixel) { return color_matching_weight(pixel, color, bias) };

        this.read_head = 1;
        this.read_prev = 0;
    }

    get_next_nail_weight(image) {
        if (!this.pixels_cache) {
            console.log("once");
            this.pixels_cache = Array(image.height).fill(0);
            for (var y = 0; y < image.height; y++) {
                this.pixels_cache[y] = Array(image.width).fill(0);
                for (var x = 0; x < image.width; x++) {
                    this.pixels_cache[y][x] = image.get_pixel_weight(new Point(x, y), this.weight_func);
                }
            }
        }
        if (!this.next_valid) {
            let chords = graph.get_connections(this.current_nail, image);
            let chord_weights = chords.map(line => line ? line.get_weight_cache(this.pixels_cache) : -Infinity);
            let max_weight = -Infinity;
            let max_weight_index;
            let max_line;
            for (var i = 0; i < graph.num_nails; i++) {
                if (chord_weights[i] > max_weight) {
                    max_weight_index = i;
                    max_weight = chord_weights[i];
                    max_line = chords[i];
                }
            }
            this.next_weight = max_weight;
            this.next_nail = max_weight_index;
            this.next_line = max_line;
            this.next_valid = true;
        }
        return this.next_weight;
    }

    move_to_next_nail(image) {
        if (!this.next_valid) {
            this.get_next_nail_weight(image);
        }
        this.current_nail = this.next_nail;
        this.nail_order.push(this.current_nail);
        this.next_valid = false;
        this.next_line.clear_cache_line(this.pixels_cache);
        this.get_next_nail_weight(image);
    }

    get_next_line() {
        if (!this.rev_order)
            this.rev_order = this.nail_order.reverse();
        if (this.read_head >= this.nail_order.length)
            return null;
        let start = graph.nails_pos[this.rev_order[this.read_head]];
        let end = graph.nails_pos[this.rev_order[this.read_prev]];
        this.read_head++;
        this.read_prev++;
        return [[start.x, start.y], [end.x, end.y]];
    }
}

// Create the graph
let graph = {
    init() {
        this.width = 30;
        this.height = this.width;
        this.radius = this.width / 3;
        this.max_iter = 10000;

        this.num_nails = 500;
        this.thread_diam = 0.2; // thread width in inches
        this.nail_diam = 0.1;
        this.nails_pos = [];

        this.connection_cache = {};

        this.threshold = 0.001;

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
        // this.threads = [
        //     new Thread(0, new Color(255, 255, 255, 255)),
        //     new Thread(100, new Color(0, 255, 255, 255)),
        //     new Thread(100, new Color(255, 255, 0, 255)),
        //     new Thread(100, new Color(255, 0, 255, 255))
        // ];
        this.threads = [
            new Thread(0, new Color(255, 255, 255, 255), 1.0), //white
            new Thread(100, new Color(58, 125, 16, 255), 1.0), //grass green
            new Thread(100, new Color(141, 255, 41, 255), 1.0), // light green
            new Thread(0, new Color(214, 172, 45, 255), 1.0), // golden brown
            new Thread(0, new Color(0, 0, 0, 255), 1.0) // golden brown
        ];
        // this.threads = [
        //     new Thread(0, new Color(255, 255, 255, 255), 1.0),
        //     new Thread(100, new Color(0, 0, 0, 255), 1.0)
        // ];
        let thread_order = this.parse_image(image);
        var simpleLine = d3.line()
        this.svg.select("g")
            .selectAll(".string")
            .remove();
        for (var i = 0; i < thread_order.length; i++) {
            let curr_thread = this.threads[thread_order[i]];
            this.svg.select("g")
                .append('path')
                .attr("d", simpleLine(curr_thread.get_next_line()))
                .attr("class", "string")
                .style("stroke", "white")
                .style("stroke-width", this.thread_diam)
                .style("stroke", `rgba(${curr_thread.color.r},${curr_thread.color.g},${curr_thread.color.b},0.3)`)
                .style("fill", "none");
        }
        console.log(this.threads);
        // let strings = this.svg.select("g")
        //     .selectAll(".strings")
        //     .data([nail_order])
        //     .join("path")
        //     .attr("class", "strings")
        //     .attr("d", d3.line(d => d.x, d => d.y))
        //     .style("stroke", "#FFFFFFA0")
        // .style("stroke-width", this.thread_diam)
        // .style("fill", "none");

        // strings.exit()
        //     .remove();

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

    // Generates a nail and color order from pixel data
    parse_image(image) {
        let iter = 0;
        let thread_order = [];
        while (iter < this.max_iter) {
            let max_thread;
            let max_thread_index;
            let max_thread_weight = -Infinity;
            for (var i = 0; i < this.threads.length; i++) {
                let weight = this.threads[i].get_next_nail_weight(image);
                if (weight >= max_thread_weight) {
                    max_thread_weight = weight;
                    max_thread_index = i;
                    max_thread = this.threads[i];
                }
            }
            if (max_thread_weight < this.threshold) {
                break;
            }
            max_thread.move_to_next_nail(image);
            thread_order.push(max_thread_index);
            iter++;
        }
        return thread_order.reverse();
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
        const max_res = 300;
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

//render_image();

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