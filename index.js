/**
 * HELPERS
 */
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

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

class Image {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
    };
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
        this.start_adj = graph.img.get_image_point(this.start, graph.frame_bb);
        this.end_adj = graph.img.get_image_point(this.end, graph.frame_bb);
        this.pixels = [];
        this.fuzz_rad = 0;
        this.compute_pixel_overlap();

        this.fade = 1 / (graph.downscale_factor * 1.8);
    };

    draw(ctx, color) {
        ctx.beginPath();
        ctx.moveTo(this.start_adj.x, this.start_adj.y);
        ctx.lineTo(this.end_adj.x, this.end_adj.y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${this.fade})`;
        ctx.stroke();
    }

    compute_pixel_overlap() {
        this.pixels = [];
        // Bresenham algorithm taken from https://stackoverflow.com/a/4672319
        var start_point = this.start_adj;
        var end_point = this.end_adj;
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

    get_line_diff(color) {
        let color_arr = [color.r, color.g, color.b, color.a];
        let total_diff = 0;

        for (var i = 0; i < this.pixels.length; i++) {
            let p = this.pixels[i];
            let ind = (p.x + p.y * graph.img.width) * 4;
            let pixel_diff = 0;
            for (var j = 0; j < 4; j++) {
                let new_c = color_arr[j] * this.fade + graph.current_ctx_data[ind + j] * (1 - this.fade);
                let diff = Math.abs(graph.orig_ctx_data[ind + j] - new_c) - Math.abs(graph.current_ctx_data[ind + j] - graph.orig_ctx_data[ind + j]);
                pixel_diff += diff;
            }
            if (pixel_diff < 0) {
                total_diff += pixel_diff;
            }
            if (pixel_diff > 0) {
                total_diff += pixel_diff / 5;
            }
        }
        return Math.pow(total_diff / this.pixels.length, 3);
    }

    add_to_buffer(color) {
        this.draw(graph.current_ctx, color);
        graph.current_ctx_data = graph.current_ctx.getImageData(0, 0, graph.img.width, graph.img.height).data;
    }
}

class Thread {
    constructor(start_nail, color) {
        this.current_nail = start_nail;
        this.color = color;
        this.current_dist = Infinity;
        this.nail_order = [start_nail];
        this.next_weight = -Infinity;
        this.next_nail;
        this.next_valid = false;
        this.next_line;

        this.read_head = 0;

        this.prev_connections = [];
    }

    get_next_nail_weight(image) {
        if (this.next_valid) {
            return this.next_dist;
        }
        let chords = graph.get_connections(this.current_nail, image);
        let min_dist = Infinity;
        let min_dist_index = Math.floor(Math.random() * graph.nail_num);
        chords.forEach((line, i) => {
            if (line) {
                let dist = line.get_line_diff(this.color);
                if (this.prev_connections[this.current_nail] && this.prev_connections[this.current_nail][i] === true) {
                    dist = 0;
                }
                if (dist < min_dist) {
                    min_dist = dist;
                    min_dist_index = i;
                }
            }
        });
        if (min_dist >= 0) {
            min_dist = Infinity;
        }

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
        if (!this.prev_connections[this.current_nail])
            this.prev_connections[this.current_nail] = [];
        this.prev_connections[this.current_nail][this.next_nail] = true;
        this.next_line.add_to_buffer(this.color);
        this.current_nail = this.next_nail;
        this.nail_order.push(this.current_nail);
        this.next_valid = false;
        this.current_dist = this.next_dist;
        this.get_next_nail_weight(image);
    }

    get_next_nail_num() {
        let nail = this.nail_order[this.read_head];
        this.read_head++;
        return nail;
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
        this.max_iter = GUI.num_connections.element.value;
        this.num_nails = GUI.num_nails.element.value;

        this.downscale_factor = 4;

        this.thread_diam = 0.01; // thread width in inches
        this.nail_diam = 0.1;
        this.nails_pos = [];

        this.line_cache = {};

        this.thread_opacity = 1.0;
        this.thread_order = [];

        this.svg = d3.select("body").insert("svg", ":first-child")
            .attr("width", "100vw")
            .attr("viewBox", [-this.width / 2, -this.height / 2, this.width, this.height])
        this.svg.append("g");
        this.svg.attr("desc", "Created using michael-crum.com/string-art-gen");

        let frame_path = this.svg.select("g")
            .append("circle")
            .attr("r", this.radius)
            .style("stroke", "#ffbe5700")
            .style("stroke-width", 10)
            .style("fill", "none");

        // let frame_path = this.svg.append("g")
        //     .lower()
        //     .append("rect")
        //     .attr("class", "frame")
        //     .attr("height", 19.25)
        //     .attr("width", 15.25)
        //     .attr("x", -this.radius)
        //     .attr("y", -this.radius)
        //     .style("stroke", "#ffbe5700")
        //     .style("stroke-width", 0.5)
        //     .style("fill", "grey");

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

        nails.append("text")
            .style("fill", "black")
            .style("stroke-width", `${this.nail_diam / 100}`)
            .style("stroke", "white")
            .attr("dx", "0")
            .attr("dy", `${(this.nail_diam / 2) * 0.7}`)
            .attr("font-size", `${this.nail_diam}px`)
            .attr("text-anchor", "middle")
            .text(function (d, i) { return i });

        this.get_frame_url();
        frame_path.style("fill", "grey");

        // Handle zooming and panning
        let zoom = d3.zoom().on('zoom', handleZoom);

        function handleZoom(e) {
            d3.selectAll('svg > g')
                .attr('transform', e.transform);
        }

        d3.select('svg').call(zoom);
    },
    get_frame_url() {
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
        this.frame_url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
    },
    download_frame() {
        var element = document.createElement('a');
        element.setAttribute("href", `${this.frame_url}`);
        element.setAttribute('download', "frame.svg");
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    },
    download_nail_seq() {
        let output = `Generated using https://michael-crum.com/string-art-gen/\n${this.render_iter} connections in total\n\n`;
        let len = this.thread_order.length;
        for (var i = 0; i < len; i++) {
            let thread = this.threads[this.thread_order[i]];
            if (i === 0 || this.thread_order[i - 1] !== this.thread_order[i])
                output += `\nThread: [${thread.color.r}, ${thread.color.g}, ${thread.color.b}]\n`;

            output += thread.get_next_nail_num();
            output += "\n";
        }
        for (var i = 0; i < this.threads.length; i++) {
            this.threads.read_head = 0;
        }
        var url = "data:text/plain;charset=utf-8," + encodeURIComponent(output);
        var element = document.createElement('a');
        element.setAttribute("href", `${url}`);
        element.setAttribute('download', "nail_seq.txt");
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);

    },
    // Returns lines connecting the given nail to all other nails
    get_connections(nail_num) {
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
            ret[i] = line;
            this.line_cache[`${Math.min(i, nail_num)}| ${Math.max(i, nail_num)} `] = line;
        }
        return ret;
    },

    setup(img) {
        this.render_iter = 0;
        this.img = img;
        this.orig_ctx = img.ctx;
        let scratch_canvas = document.createElement("canvas");
        scratch_canvas.width = img.width;
        scratch_canvas.height = img.height;
        let current_canvas = document.createElement("canvas");
        current_canvas.width = img.width;
        current_canvas.height = img.height;
        this.scratch_ctx = scratch_canvas.getContext('2d');
        this.current_ctx = current_canvas.getContext('2d', { willReadFrequently: true });
        this.current_ctx.fillStyle = "grey";
        this.current_ctx.fillRect(0, 0, this.img.width, this.img.height);
        this.orig_ctx_data = this.orig_ctx.getImageData(0, 0, this.img.width, this.img.height).data;
        this.current_ctx_data = this.current_ctx.getImageData(0, 0, this.img.width, this.img.height).data;

        this.threads = [
            new Thread(0, new Color(0, 255, 255, 255)), // C
            new Thread(0, new Color(255, 0, 255, 255)), // Y
            new Thread(0, new Color(255, 255, 0, 255)), // M
            new Thread(0, new Color(0, 0, 0, 255)), // black
            new Thread(0, new Color(255, 255, 255, 255)) // white
        ];
        this.svg.select("g")
            .selectAll(".string")
            .remove();
        this.thread_order = [];
    },

    // Generates a nail and color order from pixel data
    parse_image() {
        if (this.render_iter >= this.max_iter) {
            this.clean();
            return;
        }
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
            this.clean();
            return;
        }
        GUI.regenerate.element.innerHTML = `<b>Generating... ${(((this.render_iter) / this.max_iter) * 100).toFixed(2)}</b>%`;
        min_thread.move_to_next_nail(this.image);
        this.thread_order.push(min_thread_index);
        if (min_thread.nail_order.length > 1) {
            var simpleLine = d3.line()
            this.svg.select("g")
                .append('path')
                .attr("d", simpleLine(min_thread.get_current_line()))
                .attr("class", "string")
                .style("stroke-width", this.thread_diam)
                .style("stroke", `rgba(${min_thread.color.r},${min_thread.color.g},${min_thread.color.b},${this.thread_opacity})`)
                .style("fill", "none");
        }

        this.render_iter++;
        this.render_timeout_id = setTimeout(() => { this.parse_image() }, 0);
    },

    clean() {
        GUI.regenerate.element.innerHTML = "<b>Regenerate</b>";
        clearTimeout(this.render_timeout_id);
        console.log(this.threads);
        this.svg.selectAll("g circle.nail").raise();
    }
};

/**
 * UI
 */
class UIElement {
    constructor(desc, name, parent, callback, label) {
        this.desc = desc;
        this.name = name;
        this.parent = parent;
        this.callback = callback;
        if (label) {
            this.label = document.createElement("label");
            this.label.for = name;
            this.label.innerHTML = desc;
            parent.appendChild(this.label);
        }
    }
}

class Slider extends UIElement {
    constructor(desc, name, parent, init_val, min, max, callback) {
        super(desc, name, parent, callback, true);
        this.val = init_val;
        this.min = min;
        this.max = max;
        this.disp = document.createElement("p");
        this.disp.innerHTML = this.val;
        parent.appendChild(this.disp);
        this.element = document.createElement("input");
        this.element.id = name;
        this.element.type = "range";
        this.element.classList.add("slider");
        this.element.min = min;
        this.element.max = max;
        this.element.value = this.val;
        this.element.addEventListener("input", (e) => { callback(e); this.disp.innerHTML = e.target.value; });
        parent.appendChild(this.element);
    }
}

class Button extends UIElement {
    constructor(desc, name, parent, callback) {
        super(desc, name, parent, callback, false);
        this.element = document.createElement("button");
        this.element.id = name;
        this.element.innerHTML = `<b> ${this.desc}</b>`;
        this.element.addEventListener("click", callback);
        parent.appendChild(this.element);
    }
}

class TextEntry extends UIElement {
    constructor(desc, name, parent, value, callback) {
        super(desc, name, parent, callback, true);
        this.element = document.createElement("input");
        this.element.type = "text";
        this.element.value = value;
        parent.appendChild(this.element);
    }
}

let download = document.getElementById("download");
let basic_options = document.getElementById("basic");
let advanced_options = document.getElementById("advanced");
let controls = document.getElementById("controls");

let GUI = {
    init() {
        // Download = 
        this.nail_seq_download = new Button(
            "Nail sequence",
            "nail_sequence",
            download,
            () => {
                graph.download_nail_seq();
            });
        this.frame_download = new Button(
            "Frame with numbering",
            "frame_download",
            download,
            () => {
                graph.download_frame();
            });
        // Basic
        this.regenerate = new Button(
            "Regenerate",
            "regenerate",
            controls,
            () => {
                render_image()
            });
        this.num_nails = new Slider(
            "Number of nails:",
            "num_nails",
            basic_options,
            300,
            10, 2000,
            (e) => {
                graph.num_nails = e.target.value;
                render_image();
            });
        this.num_connections = new Slider(
            "Max # of connections:",
            "num_connections",
            basic_options,
            10000,
            100, 15000,
            (e) => {
                graph.max_iter = e.target.value;
                render_image();
            });

        // Advanced 
        this.shape_entry = new TextEntry(
            "Frame path (SVG):",
            "num_connections",
            advanced_options,
            "WIP, come back soon :)",
            (e) => {

            });
    }
}

GUI.init();

/**
* IMAGE PROCESSING
 */

function render_image(url) {
    if (graph.svg) {
        graph.svg.selectAll("*").remove();
        graph.svg.remove();
        clearTimeout(graph.render_timeout_id);
    }
    graph.init();
    var img = document.getElementById('snapshot');
    img.onload = () => {
        if (url) URL.revokeObjectURL(img.src);
    }
    if (url)
        img.src = url;
    else
        img.src = img.src;
    img.onload = function () {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Bunch of sloppy logic to resize the image / canvas to play nice with the frame bounding box.
        // The image is centered and scaled to fill the frame
        const max_res = ((graph.frame_bb.width / graph.thread_diam) / 2) / graph.downscale_factor;
        //const max_res = 400;
        let frame_ar = graph.frame_bb.width / graph.frame_bb.height;
        let img_ar = img.width / img.height;
        canvas.width = frame_ar >= 1 ? max_res : max_res * frame_ar;
        canvas.height = frame_ar < 1 ? max_res : max_res / frame_ar;
        let w = frame_ar >= img_ar ? canvas.width : canvas.height * img_ar;
        let h = frame_ar < img_ar ? canvas.height : canvas.width / img_ar;
        ctx.drawImage(img, - (w - canvas.width) / 2, - (h - canvas.height) / 2, w, h);
        let new_img = new Image(ctx, canvas.width, canvas.height);
        graph.setup(new_img);
        graph.parse_image();
    }
}

render_image();

const input = document.querySelector("input");
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
    graph.svg.style("width", "100vw")
        .style("left", "0px");
}