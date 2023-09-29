// Hide UI if query param is present
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("showUI") === "false") {
    document.getElementById("ui").style.display = "none";
}

// Create the graph
let graph = {
    init() {
        this.width = 30;
        this.height = this.width;
        this.radius = this.width / 4;

        this.num_nails = 200;
        this.thread_diam = 0.01; // thread width in inches
        this.nail_diam = 0.05;

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
            .attr("height", this.radius * 4)
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
        let string_order = this.parse_image(pixels);
        let nail_order = string_order.map((num) => nails_pos[num]);
        let strings = this.svg.select("g")
            .append("path")
            .data([nail_order])
            .attr("d", d3.line(d => d.x, d => d.y))
            .style("stroke", "white")
            .style("stroke-width", this.thread_diam)
            .style("fill", "none");

        this.svg.selectAll("g circle.nail").raise();
    },

    // Generates a nail order from pixel data
    parse_image(pixels) {
        let string_order = [];



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

            const max_res = 500;
            let frame_ar = graph.frame_bb.width / graph.frame_bb.height;
            canvas.width = frame_ar > 1 ? max_res : (img.height / max_res) * img.width;
            canvas.height = frame_ar < 1 ? max_res : (img.width / max_res) * img.height;
            let img_ar = img.width / img.height;
            ctx.drawImage(img, - (img.width - canvas.width) / 2, - (img.width - canvas.width) / 2, img.width, img.height);
            const rgba = ctx.getImageData(
                0, 0, img.width, img.height
            );
            graph.update(rgba.data);
            console.log(rgba.data);
        }
    }
})

// Handle zooming and panning
let zoom = d3.zoom().on('zoom', handleZoom);

function handleZoom(e) {
    d3.selectAll('svg g')
        .attr('transform', e.transform);
}

d3.select('svg').call(zoom);