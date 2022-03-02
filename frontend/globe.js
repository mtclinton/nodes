
// degrees to radians polyfill
if (typeof(Number.prototype.toRad) === "undefined") Number.prototype.toRad = function(){ return this * Math.PI / 180; };

function geocluster(elements, bias){
    if (!(this instanceof geocluster)) return new geocluster(elements, bias);
    return this._cluster(elements, bias);
};

// geodetic distance approximation
geocluster.prototype._dist = function(lat1, lon1, lat2, lon2) {
    var dlat = (lat2 - lat1).toRad();
    var dlon = (lon2 - lon1).toRad();
    var a = (Math.sin(dlat/2) * Math.sin(dlat/2) + Math.sin(dlon/2) * Math.sin(dlon/2) * Math.cos(lat1.toRad()) * Math.cos(lat2.toRad()));
    return (Math.round(((2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))) * 6371)*100)/100);
};

geocluster.prototype._centroid = function(set) {
    return set.reduce(function(s, e){
        return [(s[0]+e[0]),(s[1]+e[1])];
    }, [0,0]).map(function(e){
        return (e/set.length);
    });
}

geocluster.prototype._clean = function(data) {
    return data.map(function(cluster){
        return [cluster.centroid, cluster.elements];
    });
};

geocluster.prototype._cluster = function(elements, bias) {

    var self = this;

    // set bias to 1 on default
    if ((typeof bias !== "number") || isNaN(bias)) bias = 1;

    var tot_diff = 0;
    var diffs = [];
    var diff;

    // calculate sum of differences
    for (i = 1; i < elements.length; i++) {
        diff = self._dist(elements[i][0], elements[i][1], elements[i-1][0], elements[i-1][1]);
        tot_diff += diff;
        diffs.push(diff);
    }

    // calculate mean diff
    var mean_diff = (tot_diff / diffs.length);
    var diff_variance = 0;

    // calculate variance total
    diffs.forEach(function(diff){
        diff_variance += Math.pow(diff - mean_diff, 2);
    });

    // derive threshold from stdev and bias
    var diff_stdev = Math.sqrt(diff_variance / diffs.length);
    var threshold = (diff_stdev * bias);

    var cluster_map = [];

    // generate random initial cluster map
    cluster_map.push({
        centroid: elements[Math.floor(Math.random() * elements.length)],
        elements: []
    });

    // loop elements and distribute them to clusters
    var changing = true;
    while (changing === true) {

        var new_cluster = false;
        var cluster_changed = false;

        // iterate over elements
        elements.forEach(function(e, ei){

            var closest_dist = Infinity;
            var closest_cluster = null;

            // find closest cluster
            cluster_map.forEach(function(cluster, ci){

                // distance to cluster
                dist = self._dist(e[0], e[1], cluster_map[ci].centroid[0], cluster_map[ci].centroid[1]);

                if (dist < closest_dist) {
                    closest_dist = dist;
                    closest_cluster = ci;
                }

            });

            // is the closest distance smaller than the stddev of elements?
            if (closest_dist < threshold || closest_dist === 0) {

                // put element into existing cluster
                cluster_map[closest_cluster].elements.push(e);

            } else {

                // create a new cluster with this element
                cluster_map.push({
                    centroid: e,
                    elements: [e]
                });

                new_cluster = true;

            }

        });

        // delete empty clusters from cluster_map
        cluster_map = cluster_map.filter(function(cluster){
            return (cluster.elements.length > 0);
        });

        // calculate the clusters centroids and check for change
        cluster_map.forEach(function(cluster, ci){
            var centroid = self._centroid(cluster.elements);
            if (centroid[0] !== cluster.centroid[0] || centroid[1] !== cluster.centroid[1]) {
                cluster_map[ci].centroid = centroid;
                cluster_changed = true;
            }
        });

        // loop cycle if clusters have changed
        if (!cluster_changed && !new_cluster) {
            changing = false;
        } else {
            // remove all elements from clusters and run again
            if (changing) cluster_map = cluster_map.map(function(cluster){
                cluster.elements = [];
                return cluster;
            });
        }

    }

    // compress result
    return cluster_map;

};

function renderGlobe() {

    var countries;
    var nodes;
    fetch('globe-data-min.json').then(function (response) {
        if (response.ok) {
            return response.json();
        } else {
            return Promise.reject(response);
        }
    }).then(function (data) {

        // Store the post data to a variable
        countries = data;

        // Fetch another API
        return fetch('http://localhost:8080/nodes');

    }).then(function (response) {
        if (response.ok) {
            return response.json();
        } else {
            return Promise.reject(response);
        }
    }).then(function (nodesData) {
        nodes = nodesData.message;
    }).catch(function (error) {
        console.warn(error);
    }).then(showGlobe);


    function showGlobe() {

        var bias = .05; // multiply stdev with this factor, the smaller the more clusters


        var coordinates = [];
        for (let i = 0; i < nodes.length; i++) {
            var n = []
            n.push(parseFloat(nodes[i]['lat']))
            n.push(parseFloat(nodes[i]['lon']))
            coordinates.push(n)
        }
        console.log(coordinates)

        var result = geocluster(coordinates, bias);

        console.log(result)

        const nodeCentroidData = result.map((coordinate) => ({
            lat: coordinate['centroid'][0],
            lng: coordinate['centroid'][1],
            size: coordinate['elements'].length / 100,
            color: "#33e3ff"
        }));
        console.log(nodeCentroidData)


        // Initialize the Globe
        const Globe = new ThreeGlobe({
            waitForGlobeReady: true,
            animateIn: true,
        })
            .hexPolygonsData(countries.features)
            .hexPolygonResolution(3)
            .hexPolygonMargin(0.7)
            .showAtmosphere(true)
            .atmosphereColor("#3a228a")
            .atmosphereAltitude(0.25)
            .pointsData(nodeCentroidData)
            .pointAltitude('size')
            .pointColor('color');

        //new
        // const globeMaterial = Globe.globeMaterial();
        // globeMaterial.color = new THREE.Color(0x3a228a);
        // globeMaterial.emissive = new THREE.Color(0x220038);
        // globeMaterial.emissiveIntensity = 0.1;
        // globeMaterial.shininess = 0.7;

        // globeMaterial.wireframe = true;

        // NOTE Arc animations are followed after the globe enters the scene
        setTimeout(() => {

            var arcNodes = [];

            for (let i = 0; i < 40; i++) {
                const shuffled = nodeCentroidData.sort(() => 0.5 - Math.random());
                const randNodes = shuffled.slice(0, 2);
                const arcNode = {
                    "order": i,
                    "startLat": randNodes[0].lat,
                    "startLng": randNodes[0].lng,
                    "endLat": randNodes[1].lat,
                    "endLng": randNodes[1].lng,
                    "arcAlt": 0.15

                };
                arcNodes.push(arcNode);

            }


            Globe.arcsData(arcNodes)
                .arcColor(() => {
                    return "#FFC0CB";
                })
                .arcAltitude((e) => {
                    return e.arcAlt;
                })
                .arcStroke((e) => {
                    return e.status ? 0.5 : 0.3;
                })
                .arcDashLength(0.9)
                .arcDashGap(4)
                .arcDashAnimateTime(1000)
                .arcsTransitionDuration(1000)
                .arcDashInitialGap((e) => e.order * 1);
        }, 1000);

        // Setup renderer
        const renderer = new THREE.WebGLRenderer({alpha: true});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0xffffff, 0);

        // render to page
        document.body.appendChild(renderer.domElement);

        // // add it to the target element
        // var mapDiv = document.getElementById("globe");
        // mapDiv.appendChild(renderer.domElement);

        // Setup scene
        const scene = new THREE.Scene();
        scene.add(Globe);
        scene.add(new THREE.AmbientLight(0xbbbbbb));
        scene.add(new THREE.DirectionalLight(0xffffff, 0.6));

        // Setup camera
        const camera = new THREE.PerspectiveCamera();
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        camera.position.x = 100;
        camera.position.y = 265;


        // Kick-off renderer
        (function animate() { // IIFE
            // Frame cycle
            // tbControls.update();
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        })();

        var orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
        orbitControls.enableZoom = false;
        orbitControls.enableRotate = true;
        orbitControls.rotateSpeed = 3;
        orbitControls.autoRotate = true;
        orbitControls.autoRotateSpeed = 1;
        orbitControls.minPolarAngle = Math.PI / 4;
        orbitControls.maxPolarAngle = (2 * Math.PI) / 3;


        let lastRender = 0;

// render the scene
        function render() {
            requestAnimationFrame(render);

            let frameRate = 24;
            let now = Date.now();
            let elapsed = now - lastRender;

            if (elapsed > frameRate) {
                lastRender = now - (elapsed % frameRate);

                // Rerender sphere
                orbitControls.update();

                renderer.render(scene, camera);
            }
        }

        render()
    }
}

renderGlobe()