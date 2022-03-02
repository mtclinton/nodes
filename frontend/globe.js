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
        //document.body.appendChild(renderer.domElement);

        // // add it to the target element
        var mapDiv = document.getElementById("globe");
        mapDiv.appendChild(renderer.domElement);

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