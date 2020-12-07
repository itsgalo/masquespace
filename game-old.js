class Game{
	constructor(){
		if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

		this.modes = Object.freeze({
			NONE:   Symbol("none"),
			PRELOAD: Symbol("preload"),
			INITIALISING:  Symbol("initialising"),
			CREATING_LEVEL: Symbol("creating_level"),
			ACTIVE: Symbol("active"),
			GAMEOVER: Symbol("gameover")
		});
		this.mode = this.modes.NONE;

		this.container;
		this.player;
		this.cameras;
		this.camera;
		this.scene;
		this.renderer;
		this.composer;
		this.animations = {};
		this.assetsPath = 'assets/';
		this.terrainMixer;

		this.rays = new THREE.Vector3(0, 200, 0);;
		this.mouse = new THREE.Vector2();
		this.raycaster = new THREE.Raycaster();
		this.target = new THREE.Vector3(0, 200, 0);

		this.remotePlayers = [];
		this.remoteColliders = [];
		this.initialisingPlayers = [];
		this.remoteData = [];

		this.container = document.createElement( 'div' );
		this.container.style.height = '100%';
		document.body.appendChild( this.container );

		const game = this;
		this.anims = ['Walking','Running'];

		const options = {
			assets:[
				`${this.assetsPath}images/nx.jpg`,
				`${this.assetsPath}images/px.jpg`,
				`${this.assetsPath}images/ny.jpg`,
				`${this.assetsPath}images/py.jpg`,
				`${this.assetsPath}images/nz.jpg`,
				`${this.assetsPath}images/pz.jpg`
			],
			oncomplete: function(){
				game.init();
			}
		}

		this.anims.forEach( function(anim){ options.assets.push(`${game.assetsPath}fbx/anims/${anim}.fbx`)});
		options.assets.push(`${game.assetsPath}fbx/terrain.fbx`);

		this.mode = this.modes.PRELOAD;

		this.clock = new THREE.Clock();

		const preloader = new Preloader(options);

		window.onError = function(error){
			console.error(JSON.stringify(error));
		}
	}

	set activeCamera(object){
		this.cameras.active = object;
	}

	init() {
		this.mode = this.modes.INITIALISING;

		//this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 10, 200000 );
		let aspect = window.innerWidth / window.innerHeight;
		this.camera = new THREE.OrthographicCamera( 1200 * aspect / - 1.5, 1200 * aspect / 1.5, 1200 / 1.5, 1200 / - 1.5, -1200, 30000 );
  	//watch for this, too low creates raycasting issues
    this.camera.position.set( -1000, 2000, 1000 );

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color( 0xf7de97 );

		const ambient = new THREE.AmbientLight( 0xaaaaaa );
    this.scene.add( ambient );

    const light = new THREE.DirectionalLight( 0xaaaaaa );
    light.position.set( 50, 100, 50 );
    light.target.position.set( 0, 0, 0 );

    light.castShadow = true;

		const lightSize = 500;
    light.shadow.camera.near = -6000;
    light.shadow.camera.far = 6000;
		light.shadow.camera.left = light.shadow.camera.bottom = -lightSize;
		light.shadow.camera.right = light.shadow.camera.top = lightSize;

    light.shadow.bias = 1;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;

		this.sun = light;
		this.scene.add(light);

		// ground
		//let mesh = new THREE.Mesh( new THREE.PlaneBufferGeometry( 100000, 100000 ), new THREE.MeshBasicMaterial( { color: 0x00ff00, transparent: true, opacity: 0,  } ) );
		//mesh.rotation.x = - Math.PI / 2;
		//mesh.receiveShadow = true;
		//this.scene.add( mesh );

		// model
		const loader = new THREE.FBXLoader();
		const game = this;

		this.player = new PlayerLocal(this);

		this.loadEnvironment(loader);

		this.renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
		//this.renderer.setClearColor( 0xff0000, 0);
		this.renderer.setPixelRatio( window.devicePixelRatio );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		this.renderer.shadowMap.enabled = true;
		this.container.appendChild( this.renderer.domElement );

		this.controls = new THREE.OrbitControls( this.camera , this.renderer.domElement );
    this.controls.enableZoom = false;
		this.controls.enablePan = false;

		//bind is important!
		this.renderer.domElement.addEventListener( 'touchstart', this.onTouch.bind(this), false);
		this.renderer.domElement.addEventListener( 'mousedown', this.onMouseDown.bind(this), false );
		this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this), false);
		this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this), false);

		window.addEventListener( 'resize', () => game.onWindowResize(), false );

	}

	loadEnvironment(loader){
		const game = this;
		loader.load(`${this.assetsPath}fbx/terrain.fbx`, function(object){
			game.environment = object;
			game.colliders = [];
			game.scene.add(object);
			object.traverse( function ( child ) {
				if ( child.isMesh ) {
						game.colliders.push(child);
						//child.material = new THREE.MeshLambertMaterial({color: 0x00eeff});
						child.castShadow = true;
						child.receiveShadow = true;
				}
				if ( child.isMesh ) {
					game.terrainMixer = new THREE.AnimationMixer(object);
					game.terrainMixer.clipAction(object.animations[0]).play();
				}
			} );

			game.loadNextAnim(loader);
		})
	}

	loadNextAnim(loader){
		let anim = this.anims.pop();
		const game = this;
		loader.load( `${this.assetsPath}fbx/anims/${anim}.fbx`, function( object ){
			game.player.animations[anim] = object.animations[0];
			if (game.anims.length>0){
				game.loadNextAnim(loader);
			}else{
				delete game.anims;
				game.action = "Idle";
				game.mode = game.modes.ACTIVE;
				game.animate();
			}
		});
	}

	playerControl(){
		let distx = Math.abs(this.player.object.position.x - this.target.x);
		let distz = Math.abs(this.player.object.position.z - this.target.z);

		if (distx > 20 || distz > 20){
			if (this.player.action!='Walking' && this.player.action!='Running') this.player.action = 'Running';
		}else if (distx < 20 && distz < 20 && distx > 10 && distz > 10){
			if (this.player.action!='Walking') this.player.action = 'Walking';
		}else{
			if (this.player.action!="Idle"){
				this.player.action = 'Idle';
			}
		}
		this.player.motion = 'moving';
		this.player.updateSocket();
	}

	createCameras(){
		const offset = new THREE.Vector3(0, 80, 0);
		const front = new THREE.Object3D();
		front.position.set(112, 100, 600);
		front.parent = this.player.object;
		const back = new THREE.Object3D();
		back.position.set(0, 300, -1050);
		back.parent = this.player.object;
		const chat = new THREE.Object3D();
		chat.position.set(0, 200, -450);
		chat.parent = this.player.object;
		const wide = new THREE.Object3D();
		wide.position.set(178, 139, 1665);
		wide.parent = this.player.object;
		const overhead = new THREE.Object3D();
		overhead.position.set(0, 400, 0);
		overhead.parent = this.player.object;
		const collect = new THREE.Object3D();
		collect.position.set(40, 82, 94);
		collect.parent = this.player.object;
		this.cameras = { front, back, wide, overhead, collect, chat };
		this.activeCamera = this.cameras.back;
	}

	onWindowResize() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		this.renderer.setSize( window.innerWidth, window.innerHeight );

	}

	updateRemotePlayers(dt){
		if (this.remoteData===undefined || this.remoteData.length == 0 || this.player===undefined || this.player.id===undefined) return;

		const newPlayers = [];
		const game = this;
		//Get all remotePlayers from remoteData array
		const remotePlayers = [];
		const remoteColliders = [];

		this.remoteData.forEach( function(data){
			if (game.player.id != data.id){
				//Is this player being initialised?
				let iplayer;
				game.initialisingPlayers.forEach( function(player){
					if (player.id == data.id) iplayer = player;
				});
				//If not being initialised check the remotePlayers array
				if (iplayer===undefined){
					let rplayer;
					game.remotePlayers.forEach( function(player){
						if (player.id == data.id) rplayer = player;
					});
					if (rplayer===undefined){
						//Initialise player
						game.initialisingPlayers.push( new Player( game, data ));
					}else{
						//Player exists
						remotePlayers.push(rplayer);
						remoteColliders.push(rplayer.collider);
					}
				}
			}
		});

		this.scene.children.forEach( function(object){
			if (object.userData.remotePlayer && game.getRemotePlayerById(object.userData.id)==undefined){
				game.scene.remove(object);
			}
		});

		this.remotePlayers = remotePlayers;
		this.remoteColliders = remoteColliders;
		this.remotePlayers.forEach(function(player){ player.update( dt ); });
	}
	onTouch(event) {
		event.preventDefault();
		this.mouse.x = ( event.touches[0].pageX / window.innerWidth ) * 2 - 1 ;
    this.mouse.y = - ( event.touches[0].pageY / window.innerHeight ) * 2 + 1;
		this.target = new THREE.Vector3(this.rays.x, 200, this.rays.z);
		return false;
	}
	onMouseDown( event ) {
		event.preventDefault();
		if (event.which == 3) {
			this.target = new THREE.Vector3(this.rays.x, 200, this.rays.z);
		}
	}
	onMouseUp() {
		//this.mouseIsPressed = false;
	}
	onMouseMove(event) {
    event.preventDefault();
    this.mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	  this.mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
  }
	getRemotePlayerById(id){
		if (this.remotePlayers===undefined || this.remotePlayers.length==0) return;

		const players = this.remotePlayers.filter(function(player){
			if (player.id == id) return true;
		});

		if (players.length==0) return;

		return players[0];
	}

	animate() {
		const game = this;
		const dt = this.clock.getDelta();

		requestAnimationFrame( function(){ game.animate(); } );

		this.updateRemotePlayers(dt);

		this.raycaster.setFromCamera( this.mouse, this.camera );
		// calculate objects intersecting the picking ray
		let intersects = this.raycaster.intersectObjects( this.scene.children, true );
		for ( var i = 0; i < intersects.length; i++ ) {
		  this.rays = intersects[i].point;
		}

		if (this.player.mixer!=undefined && this.mode==this.modes.ACTIVE) this.player.mixer.update(dt);
		if (this.terrainMixer != undefined) this.terrainMixer.update(dt);

		//this.player.move(dt);
		if (this.player.motion !== undefined) this.player.move(dt);
		this.playerControl();

		this.controls.minPolarAngle = Math.PI/3;
		this.controls.maxPolarAngle = Math.PI/3;
		this.controls.update();
		//this.camera.position.y = this.player.object.position.y;

		this.renderer.render( this.scene, this.camera );
	}
}

class Player{
	constructor(game, options){
		this.local = true;
		let model, colour;

		colour = [Math.random(), Math.random(), Math.random()];

		if (options===undefined){
			const people = ['B'];
			model = people[Math.floor(Math.random()*people.length)];
		}else if (typeof options =='object'){
			this.local = false;
			this.options = options;
			this.id = options.id;
			model = options.model;
			colour = options.colour;
		}else{
			model = options;
		}
		this.model = model;
		this.colour = colour;
		this.game = game;
		this.animations = this.game.animations;

		const loader = new THREE.FBXLoader();
		const player = this;

		loader.load( `${game.assetsPath}fbx/people/${model}.fbx`, function ( object ) {

			object.mixer = new THREE.AnimationMixer( object );
			player.root = object;
			player.mixer = object.mixer;

			object.name = "Person";
			object.traverse( function ( child ) {
				if ( child.isMesh ) {
					child.castShadow = true;
					child.receiveShadow = true;

					child.material = new THREE.MeshBasicMaterial({
						color: new THREE.Color(colour[0], colour[1], colour[2]),
						skinning: true
						});
					//child.material.skinning = true;
					//child.material.emissive = new THREE.Color(colour[0], colour[1], colour[2]);;
				}
			} );

			player.object = new THREE.Object3D();
			player.object.position.set(Math.floor(Math.random()*1000), 0, Math.floor(Math.random()*1000));
			player.object.rotation.set(Math.floor(Math.random()*90), 0, 0);
			player.object.add(object);

			//const geometry = new THREE.BoxGeometry(55 + Math.random()*20,80 + Math.random()*80,55 + Math.random()*20);
			//const material = new THREE.MeshLambertMaterial({color: new THREE.Color(colour[0], colour[1], colour[2])});
			//const box = new THREE.Mesh(geometry, material);
			//box.rotation.set(0, Math.PI / 2, 0);
			//box.position.set(-5, 160, 10);
			//player.object.add(box);

			// const material = new THREE.MeshLambertMaterial({color: colour});

			if (player.deleted===undefined){
				game.scene.add(player.object);
			}

			if (player.local){
				game.createCameras();
				//game.sun.target = game.player.object;
				game.animations.Idle = object.animations[0];

				if (player.initSocket!==undefined) player.initSocket();
			}else{
				 // const geometry = new THREE.BoxGeometry(100,300,100);
				 // const material = new THREE.MeshLambertMaterial({color: colour});
				 // const box = new THREE.Mesh(geometry, material);
				 // box.name = "Collider";
				 // box.position.set(0, 150, 0);
				 // player.object.add(box);
				 // player.collider = box;
				player.object.userData.id = player.id;
				player.object.userData.remotePlayer = true;
				const players = game.initialisingPlayers.splice(game.initialisingPlayers.indexOf(this), 1);
				game.remotePlayers.push(players[0]);
			}

			if (game.animations.Idle!==undefined) player.action = "Idle";
		} );
	}

	set action(name){
		//Make a copy of the clip if this is a remote player
		if (this.actionName == name) return;
		const clip = (this.local) ? this.animations[name] : THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(this.animations[name]));
		const action = this.mixer.clipAction( clip );
        action.time = 0;
		this.mixer.stopAllAction();
		this.actionName = name;
		this.actionTime = Date.now();

		action.fadeIn(0.5);
		action.play();
	}

	get action(){
		return this.actionName;
	}

	update(dt){
		this.mixer.update(dt);

		if (this.game.remoteData.length>0){
			let found = false;
			for(let data of this.game.remoteData){
				if (data.id != this.id) continue;
				//Found the player
				this.object.position.set( data.x, data.y, data.z );
				const euler = new THREE.Euler(data.pb, data.heading, data.pb);
				this.object.quaternion.setFromEuler( euler );
				this.action = data.action;
				found = true;
			}
			if (!found) this.game.removePlayer(this);
		}
	}
}

class PlayerLocal extends Player{
	constructor(game, model){
		super(game, model);

		const player = this;
		const socket = io.connect();
		socket.on('setId', function(data){
			player.id = data.id;
		});
		socket.on('remoteData', function(data){
			game.remoteData = data;
		});
		socket.on('deletePlayer', function(data){
			const players = game.remotePlayers.filter(function(player){
				if (player.id == data.id){
					return player;
				}
			});

		if (players.length>0){
			let index = game.remotePlayers.indexOf(players[0]);
			if (index!=-1){
				game.remotePlayers.splice( index, 1 );
				game.scene.remove(players[0].object);
			}
    }else{
        index = game.initialisingPlayers.indexOf(data.id);
        if (index!=-1){
          const player = game.initialisingPlayers[index];
          player.deleted = true;
          game.initialisingPlayers.splice(index, 1);
        }
			}
		});

		this.socket = socket;
	}

	initSocket(){
		//console.log("PlayerLocal.initSocket");
		this.socket.emit('init', {
			model:this.model,
			colour: this.colour,
			x: this.object.position.x,
			y: this.object.position.y,
			z: this.object.position.z,
			h: this.object.rotation.y,
			pb: this.object.rotation.x
		});
	}

	updateSocket(){
		if (this.socket !== undefined){
			this.socket.emit('update', {
				x: this.object.position.x,
				y: this.object.position.y,
				z: this.object.position.z,
				h: this.object.rotation.y,
				pb: this.object.rotation.x,
				action: this.action
			})
		}
	}

	move(dt){

		  let disx = this.object.position.x + (game.target.x - this.object.position.x) * 0.01;
		  let disz = this.object.position.z + (game.target.z - this.object.position.z) * 0.01;
		  this.object.position.x = disx;
		  this.object.position.z = disz;

		  this.object.lookAt(game.target.x, this.object.position.y, game.target.z);
		  if (Math.abs(this.object.position.x - game.target.x) < 30 && Math.abs(this.object.position.z - game.target.z) < 30) {
				let eyes = new THREE.Vector3(game.rays.x, this.object.position.y, game.rays.z);
		  	this.object.lookAt(eyes);
		  }

		const pos = this.object.position.clone();
		pos.y += 60;
		let dir = new THREE.Vector3();
		this.object.getWorldDirection(dir);

		let raycaster = new THREE.Raycaster(pos, dir);
		let blocked = false;
		const colliders = this.game.colliders;

		if (colliders!==undefined){
			const intersect = raycaster.intersectObjects(colliders);
			if (intersect.length>0){
				if (intersect[0].distance<50) blocked = true;
			}
		}

		if (colliders!==undefined){
			//cast left
			dir.set(-1,0,0);
			dir.applyMatrix4(this.object.matrix);
			dir.normalize();
			raycaster = new THREE.Raycaster(pos, dir);

			let intersect = raycaster.intersectObjects(colliders);
			if (intersect.length>0){
				if (intersect[0].distance<50) this.object.translateX(100-intersect[0].distance);
			}

			//cast right
			dir.set(1,0,0);
			dir.applyMatrix4(this.object.matrix);
			dir.normalize();
			raycaster = new THREE.Raycaster(pos, dir);

			intersect = raycaster.intersectObjects(colliders);
			if (intersect.length>0){
				if (intersect[0].distance<50) this.object.translateX(intersect[0].distance-100);
			}

			//cast down
			dir.set(0,-1,0);
			pos.y += 200;
			raycaster = new THREE.Raycaster(pos, dir);
			const gravity = 30;

			intersect = raycaster.intersectObjects(colliders);
			if (intersect.length>0){
				const targetY = pos.y - intersect[0].distance;
				if (targetY > this.object.position.y){
					//Going up
					this.object.position.y = 0.8 * this.object.position.y + 0.2 * targetY;
					this.velocityY = 0;
				}else if (targetY < this.object.position.y){
					//Falling
					if (this.velocityY==undefined) this.velocityY = 0;
					this.velocityY += dt * gravity;
					this.object.position.y -= this.velocityY;
					if (this.object.position.y < targetY){
						this.velocityY = 0;
						this.object.position.y = targetY;
					}
				}
			}
		}

		this.updateSocket();
	}
}
