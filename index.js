/**
 * HELPERS
 */

function invert(imgData) {
    var d = imgData;
    for (var i = 0; i < d.length; i += 4) {   //r,g,b,a
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
    }
    return imgData;
}

// https://gist.github.com/xposedbones/75ebaef3c10060a3ee3b246166caab56
const constrain = (val, min, max) => (val < min ? min : (val > max ? max : val))
const map = (value, x1, y1, x2, y2) => (value - x1) * (y2 - x2) / (y1 - x1) + x2;

/**
 * GRAPHING
 */

class Color {
    constructor(r, g, b, a) {
        this.r = r;
        this.b = b;
        this.g = g;
        this.a = a;
    }
}

class ColorCMYK {
    constructor(c, m, y, k) {
        this.c = c;
        this.m = m;
        this.y = y;
        this.k = k;

        if (!k) {
            this.from_rgb(c, m, y);
        }
    };

    //https://www.standardabweichung.de/code/javascript/rgb-cmyk-conversion-javascript
    from_rgb(r, g, b) {
        var c = 1 - (r / 255);
        var m = 1 - (g / 255);
        var y = 1 - (b / 255);
        var k = Math.min(c, Math.min(m, y));

        c = (c - k) / (1 - k);
        m = (m - k) / (1 - k);
        y = (y - k) / (1 - k);

        c = isNaN(c) ? 0 : c;
        m = isNaN(m) ? 0 : m;
        y = isNaN(y) ? 0 : y;
        k = isNaN(k) ? 0 : k;

        this.c = c;
        this.m = m;
        this.y = y;
        this.k = k;
    };

    mix(color, per) {
        return new ColorCMYK(
            (this.c + color.c * per) / (1 + per),
            (this.m + color.m * per) / (1 + per),
            (this.y + color.y * per) / (1 + per),
            (this.k + color.k * per) / (1 + per)
        );
    }
}

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

class Image {
    constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
        this.channels = {
            "c": math.zeros([this.height, this.width]),
            "m": math.zeros([this.height, this.width]),
            "y": math.zeros([this.height, this.width]),
            "k": math.zeros([this.height, this.width]),
            "black": math.zeros([this.height, this.width])
        };
    };
    split_channels() {
        for (var i = 0; i < this.data.length; i += 4) {
            let cmyk = new ColorCMYK(this.data[i], this.data[i + 1], this.data[i + 2]);
            let x = (i / 4) % this.width;
            let y = Math.floor((i / 4) / this.width);
            this.channels["c"][y][x] = cmyk.c;
            this.channels["m"][y][x] = cmyk.m;
            this.channels["y"][y][x] = cmyk.y;
            this.channels["k"][y][x] = cmyk.k;

            this.channels["black"][y][x] = (1 - (0.299 * this.data[i] + 0.587 * this.data[i + 1] + 0.114 * this.data[i + 2]) / 255) * (this.data[i + 3] / 255);
        }
    }
    // Convert from SVG coords into pixels
    get_image_point(svg_point, bounding_box) {
        let x = Math.floor(map(svg_point.x, bounding_box.x, bounding_box.x + bounding_box.width, 0, this.width - 1));
        let y = Math.floor(map(svg_point.y, bounding_box.y, bounding_box.y + bounding_box.height, 0, this.height - 1));
        return new Point(x, y);
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

    // returns the l1 norm of the difference
    get_line_diff(buffer, fill_val, orig) {
        let total_diff = 0;
        for (var i = 0; i < this.pixels.length; i++) {
            let curr = buffer.get([this.pixels[i].y, this.pixels[i].x]);
            let new_val = constrain(((fill_val * graph.thread_opacity + curr) / (1 + graph.thread_opacity)), 0.0, 1.0);
            total_diff += Math.abs(orig.get([this.pixels[i].y, this.pixels[i].x]) - new_val) - Math.abs(orig.get([this.pixels[i].y, this.pixels[i].x]) - curr);
            //buffer.set([this.pixels[i].y, this.pixels[i].x], new_val);
        }
        return total_diff;
    }

    add_to_buffer(buffer, fill_val, orig) {
        for (var i = 0; i < this.pixels.length; i++) {
            let curr = buffer.get([this.pixels[i].y, this.pixels[i].x]);
            let new_val = constrain(((fill_val * graph.thread_opacity + curr) / (1 + graph.thread_opacity)), 0.0, 1.0);
            buffer.set([this.pixels[i].y, this.pixels[i].x], new_val);
        }
    }
}

class Thread {
    constructor(start_nail, color, buffer, fill_val) {
        this.current_nail = start_nail;
        this.color = color;
        this.buffer = math.matrix(buffer);
        this.current_buffer = math.matrix(math.zeros(this.buffer.size()));
        this.current_dist = math.sum(math.abs(math.subtract(this.current_buffer, this.buffer)));
        this.nail_order = [start_nail];
        this.next_weight = -Infinity;
        this.next_nail;
        this.next_valid = false;
        this.next_line;
        this.next_buffer;
        this.prev_nail = -1;

        this.fill_val = fill_val;

        this.read_head = 1;
        this.read_prev = 0;
    }

    get_next_nail_weight(image) {
        let slack = 10.0;
        if (this.next_valid) {
            return this.next_dist;
        }
        let chords = graph.get_connections(this.current_nail, image);
        let min_dist = Infinity;
        let min_dist_index = Math.floor(Math.random() * graph.nail_num);
        let min_buffer;
        chords.forEach((line, i) => {
            if (i !== this.prev_nail) {
                if (line) {
                    let dif = line.get_line_diff(this.current_buffer, this.fill_val, this.buffer);
                    let dist = dif;
                    if (dist < min_dist && Math.abs(dist) > 0.1) {
                        min_dist = dist;
                        min_dist_index = i;
                    }
                }
            }
        });
        console.log(min_dist)
        // if (this.current_dist <= min_dist + slack) {
        //     min_dist = Infinity;
        // } && dist > 0.0001

        this.next_dist = min_dist;
        this.next_nail = min_dist_index;
        this.next_line = chords[min_dist_index];
        this.next_valid = true;
        return min_dist;
    }

    move_to_next_nail(image) {
        if (!this.next_valid) {
            this.get_next_nail_weight(image);
        }
        this.next_line.add_to_buffer(this.current_buffer, this.fill_val, this.buffer);
        this.prev_nail = this.current_nail;
        this.current_nail = this.next_nail;
        this.nail_order.push(this.current_nail);
        this.next_valid = false;
        this.current_dist = this.next_dist;
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

    get_current_line() {
        let start = graph.nails_pos[this.nail_order[this.nail_order.length - 1]];
        let end = graph.nails_pos[this.nail_order[this.nail_order.length - 2]];
        return [[start.x, start.y], [end.x, end.y]];
    }
}

// Create the graph
let graph = {
    init() {
        this.render_timeout_id = null;
        this.render_iter = 0;
        this.width = 30;
        this.height = this.width;
        this.radius = this.width / 3;
        this.max_iter = 3000;

        this.num_nails = 300;
        this.thread_diam = 0.01; // thread width in inches
        this.nail_diam = 0.1;
        this.nails_pos = [];

        this.line_cache = {};

        this.thread_opacity = 1.0;
        this.thread_order = [];

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
            .lower()
            .append("rect")
            .attr("class", "frame")
            .attr("width", 19.25)
            .attr("height", 15.25)
            .attr("x", -this.radius)
            .attr("y", -this.radius)
            .style("stroke", "#ffbe5700")
            .style("stroke-width", 0.5)
            .style("fill", "white");

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
            .join("g")
            .attr("transform", (d) => {
                let pos = frame_path.node().getPointAtLength((d / this.num_nails) * frame_length);
                this.nails_pos.push(new Point(pos.x, pos.y));
                return `translate(${pos.x}, ${pos.y})`;
            });
        nails.append("circle")
            .attr("class", "nail")
            .attr("r", this.nail_diam / 2)
            .attr("fill", "aqua");
        // nails.append("text")
        //     .style("fill", "black")
        //     .style("stroke-width", `${this.nail_diam / 100}`)
        //     .style("stroke", "white")
        //     .attr("dx", "0")
        //     .attr("dy", `${(this.nail_diam / 2) * 0.7}`)
        //     .attr("font-size", `${this.nail_diam}px`)
        //     .attr("text-anchor", "middle")
        //     .text(function (d, i) { return i });
        var serializer = new XMLSerializer();
        var source = serializer.serializeToString(this.svg.node());

        //add name spaces.
        if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
            source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        }

        //add xml declaration
        source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

        //convert svg source to URI data scheme.
        var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
        console.log(url);
    },
    update(thread_order) {
        var simpleLine = d3.line()
        this.svg.select("g")
            .selectAll(".string")
            .remove();
        for (var i = 0; i < thread_order.length; i++) {
            let curr_thread = this.threads[thread_order[i]];
            let next_line = curr_thread.get_next_line();
            this.svg.select("g")
                .append('path')
                .attr("d", simpleLine(next_line))
                .attr("class", "string")
                .style("stroke", "white")
                .style("stroke-width", this.thread_diam)
                .style("stroke", `rgba(${curr_thread.color.r}, ${curr_thread.color.g}, ${curr_thread.color.b}, ${this.thread_opacity})`)
                .style("fill", "none");
        }
        console.log(this.threads);
        this.svg.selectAll("g circle.nail").raise();
        this.svg.selectAll()
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
            let cache = this.line_cache[`${Math.min(i, nail_num)}| ${Math.max(i, nail_num)} `];
            if (cache) {
                ret[i] = cache;
                continue;
            }
            let dst = this.nails_pos[i];
            let line = new Line(src, dst);
            line.compute_pixel_overlap(image, this.frame_bb);
            ret[i] = line;
            this.line_cache[`${Math.min(i, nail_num)}| ${Math.max(i, nail_num)} `] = line;
        }
        return ret;
    },

    setup(img) {
        this.image = img;
        this.threads = [
            new Thread(0, new Color(0, 255, 255, 255), img.channels["c"], 1.0),
            new Thread(0, new Color(255, 0, 255, 255), img.channels["m"], 1.0),
            new Thread(0, new Color(255, 255, 0, 255), img.channels["y"], 1.0),
            new Thread(0, new Color(0, 0, 0, 255), img.channels["black"], 1.0)
        ];
        this.svg.select("g")
            .selectAll(".string")
            .remove();
        this.thread_order = [];
    },

    // Generates a nail and color order from pixel data
    parse_image() {
        if (this.render_iter >= this.max_iter) {
            this.update(this.thread_order.reverse());
            clearTimeout(this.render_timeout_id);
            return;
        }
        console.log(this.render_iter);
        let min_thread;
        let min_thread_index;
        let min_thread_weight = Infinity;
        for (var i = 0; i < this.threads.length; i++) {
            let weight = this.threads[i].get_next_nail_weight(this.image);
            if (weight <= min_thread_weight) {
                min_thread_weight = weight;
                min_thread_index = i;
                min_thread = this.threads[i];
            }
        }
        if (min_thread_weight === Infinity) {
            this.update(this.thread_order.reverse());
            clearTimeout(this.render_timeout_id);
            return
        }
        console.log(min_thread.next_nail);
        min_thread.move_to_next_nail(this.image);
        this.thread_order.push(min_thread_index);
        if (min_thread.nail_order.length > 1) {
            var simpleLine = d3.line()
            this.svg.select("g")
                .append('path')
                .attr("d", simpleLine(min_thread.get_current_line()))
                .attr("class", "string")
                .style("stroke", "white")
                .style("stroke-width", this.thread_diam)
                .style("stroke", `rgba(${min_thread.color.r},${min_thread.color.g},${min_thread.color.b},${this.thread_opacity})`)
                .style("fill", "none");
        }
        this.render_iter++;
        this.render_timeout_id = setTimeout(() => { this.parse_image() }, 0);
    }
};
graph.init();

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

function render_buffer(buffer, canvas_id) {
    let buf = buffer._data.flat();
    let rgba = [];
    for (var i = 0; i < buf.length; i++) {
        for (var j = 0; j < 3; j++) { rgba.push(buf[i] * 255); }
        rgba.push(255.0);
    }
    const canvas = document.getElementById(canvas_id);
    const ctx = canvas.getContext('2d');
    canvas.width = buffer.size()[1];
    canvas.height = buffer.size()[0];
    let dataImage = ctx.createImageData(canvas.width, canvas.height);
    dataImage.data.set(rgba);
    ctx.putImageData(dataImage, 0, 0);
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
        // The image is centered and scaled to fill the frame
        const max_res = (graph.frame_bb.width / graph.thread_diam) / 2;
        console.log(max_res);
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
        //rgba.data.set(invert(rgba.data));
        let new_img = new Image(rgba.data, canvas.width, canvas.height);
        new_img.split_channels();
        graph.setup(new_img);
        graph.parse_image();
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
    d3.selectAll('svg > g')
        .attr('transform', e.transform);
}

d3.select('svg').call(zoom);