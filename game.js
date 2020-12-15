class Game {
  constructor(){
    this.container;
    this.player;
    this.camera;
    this.scene;
    this.renderer;
    this.terrain;

    this.rays = new THREE.Vector3(0, 0, 0);;
		this.mouse = new THREE.Vector2();
		this.raycaster = new THREE.Raycaster();
		this.target = new THREE.Vector3(0, 0, 0);
    this.renderedTarget;

    this.remotePlayers = [];
		this.remoteColliders = [];
		this.initPlayers = [];
		this.remoteData = [];

    this.clock = new THREE.Clock();
    this.theta = 0;

    const game = this;

		this.container = document.createElement( 'div' );
		this.container.style.height = '100%';
		document.body.appendChild( this.container );

    //handle loading environment
    const manager = new THREE.LoadingManager();
    manager.onLoad = function() {
      console.log('loading environment done');
    }
    const bgLoader = new THREE.GLTFLoader(manager);
    bgLoader.load('assets/gltf/environment.glb', function(object){
      game.terrain = object;
      game.init();
      game.animate();
    });

  }

  init() {
    let aspect = window.innerWidth / window.innerHeight;
    let frustumSize = 250;
    this.camera = new THREE.OrthographicCamera( frustumSize * aspect / - 2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / - 2, -2000, 2000 );
    //this.camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 1, 10000 );
    //watch for this, too low creates raycasting issues too high and the text doesn't show. normalize is important!
    this.camera.position.set( -100, 100, 100 );
    this.camera.updateProjectionMatrix();

		this.scene = new THREE.Scene();
		//this.scene.background = new THREE.Color( 0xffffff );

		const ambient = new THREE.AmbientLight( 0xaaaaaa );
    this.scene.add( ambient );

    const light = new THREE.DirectionalLight( 0x808080 );
    light.position.set( 50, 100, 50 );
    light.target.position.set( 0, 0, 0 );
    light.castShadow = true;

		const lightSize = 500;
    light.shadow.camera.near = -600;
    light.shadow.camera.far = 600;
		light.shadow.camera.left = light.shadow.camera.bottom = -lightSize;
		light.shadow.camera.right = light.shadow.camera.top = lightSize;
    light.shadow.bias = 1;
    light.shadow.mapSize.width = 512;
    light.shadow.mapSize.height = 512;

		this.sun = light;
		this.scene.add(light);

    const crosshair = new THREE.SphereBufferGeometry( 2, 32, 32 );
    const crosshairMat = new THREE.MeshBasicMaterial( {color: 0xffff00} );
    const crosshairBox = new THREE.Mesh( crosshair, crosshairMat );
    crosshairBox.position.set(this.rays.x, this.rays.y, this.rays.z);
    this.renderedTarget = crosshairBox;
    this.scene.add( crosshairBox );

		this.renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
		this.renderer.setPixelRatio( window.devicePixelRatio );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		this.renderer.shadowMap.enabled = true;
		this.container.appendChild( this.renderer.domElement );

		this.controls = new THREE.OrbitControls( this.camera , this.renderer.domElement );
    //this.controls.enableZoom = false;
		this.controls.enablePan = false;

    // model
		const game = this;
		this.loadEnvironment(game.terrain);
    this.player = new PlayerLocal(this);

		//bind is important!
    this.renderer.domElement.addEventListener( 'touchstart', this.onTouch.bind(this), false );
		this.renderer.domElement.addEventListener( 'pointerdown', this.onPointerDown.bind(this), false );
		this.renderer.domElement.addEventListener('pointerup', this.onMouseUp.bind(this), false);
		this.renderer.domElement.addEventListener('pointermove', this.onMouseMove.bind(this), false);

		window.addEventListener( 'resize', () => game.onWindowResize(), false );

  }

  loadEnvironment(object){
		const game = this;
		game.environment = object;
		game.colliders = [];
    object.scene.scale.set(5,5,5);
    //object.scene.position.set(0, -100, 0);
		game.scene.add(object.scene);
    object.scene.traverse( function ( child ) {
      if ( child.isMesh ) {
          game.colliders.push(child);
          //child.geometry.computeFaceNormals();
          //child.material = new THREE.MeshNormalMaterial();
          //child.material = new THREE.MeshBasicMaterial({color: 0x000000});
          child.material.side = THREE.FrontSide;
          //child.castShadow = true;
          //child.receiveShadow = true;
      }
      if ( child.isMesh ) {
        //game.terrainMixer = new THREE.AnimationMixer(object);
        //game.terrainMixer.clipAction(object.animations[0]).play();
      }
    });
	}

  onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    let frustumSize = 200;
		this.camera.left = - frustumSize * aspect / 2;
		this.camera.right = frustumSize * aspect / 2;
		this.camera.top = frustumSize / 2;
		this.camera.bottom = - frustumSize / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize( window.innerWidth, window.innerHeight );
  }
  //interaction handlers
  onTouch(event) {
		event.preventDefault();
		this.mouse.x = ( event.touches[0].pageX / window.innerWidth ) * 2 - 1 ;
    this.mouse.y = - ( event.touches[0].pageY / window.innerHeight ) * 2 + 1;
		this.target = new THREE.Vector3(this.rays.x, this.rays.y, this.rays.z);
		return false;
	}
	onPointerDown(event) {
		event.preventDefault();
		if (event.which == 3) {
			this.target = new THREE.Vector3(this.rays.x, this.rays.y, this.rays.z);
		}
    return false;
	}
	onMouseUp() {
    //this.scene.add(new THREE.ArrowHelper( this.raycaster.ray.direction, this.rays, -100, Math.random() * 0xffffff ));
	}
	onMouseMove(event) {
    event.preventDefault();
    this.mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	  this.mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    this.renderedTarget.position.set(this.rays.x, this.rays.y, this.rays.z);
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
				game.initPlayers.forEach( function(player){
					if (player.id == data.id){
            iplayer = player;
          }
				});
				//If not being initialised check the remotePlayers array
				if (iplayer===undefined){
					let rplayer;
					game.remotePlayers.forEach( function(player){
						if (player.id == data.id){
              rplayer = player;
            }
					});
					if (rplayer===undefined){
						//Initialise player
						game.initPlayers.push( new Player( game, data ));
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
		this.remotePlayers.forEach(function(player){
      player.update(dt);
    });
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
    //bad words filter for text input
    let filter = new Filter();
    //if (this.player) this.player.move(dt);
    if(this.player.isLoaded) {
      this.player.updateSocket();
      this.player.move(dt);
      if (document.getElementById('chatText').value){
        this.player.msg = filter.clean(document.getElementById('chatText').value);
      } else {
        this.player.msg = this.player.id;
      }
    }

    //handle raycasting
    this.raycaster.setFromCamera(this.mouse, this.camera);
		// calculate objects intersecting the picking ray
		let intersects = this.raycaster.intersectObjects( this.colliders, true );
    // must be [0] so that it's the first point to be intersected, not all the objects in the scene.
    if (intersects.length != 0) {
      this.rays = intersects[0].point;
    }

    if (this.player.mixer!=undefined){
      this.player.mixer.update(dt);
    }

    this.controls.update();
    this.renderer.render( this.scene, this.camera );
  }
}

class Player {
  constructor(game, options){
    this.local = true;
    this.isLoaded = false;
    let model, color;
    color = [Math.random(), Math.random(), Math.random()];
    //check whether player has options, if not it is a new player
    if(options === undefined){
      const models = ['player1', 'player2'];
      model = models[Math.floor(Math.random()*models.length)];
    } else if (typeof options == 'object'){
      this.local = false;
      this.options = options;
      this.id = options.id;
      model = options.model;
      color = options.color;
    }else{
      model = options;
    }

    this.model = model;
    this.color = color;
    this.game = game;

    const playerLoader = new THREE.GLTFLoader();
    const player = this;
    //load player model
    playerLoader.load('assets/gltf/' + model + '.glb', function(object) {
      object.mixer = new THREE.AnimationMixer(object.scene);
      //player.root = object;
      player.mixer = object.mixer;
      for(let i = 0; i < object.animations.length; i++){
        let action = player.mixer.clipAction(object.animations[i]);
        action.play();
      }
      //let action = player.mixer.clipAction(object.animations[0]);
    //  action.play();

      object.name = "Player";
      object.scene.traverse( function ( child ) {
				if ( child.isMesh ) {
					child.castShadow = true;
					child.receiveShadow = true;
					child.material = new THREE.MeshLambertMaterial({
						color: new THREE.Color(color[0], color[1], color[2])
						});
				}
			});
      player.object = new THREE.Object3D();
      player.object.position.set(Math.floor(Math.random()*10), 10, Math.floor(Math.random()*10));
			player.object.rotation.set(Math.floor(Math.random()*90), 0, 0);
			player.object.add(object.scene);
      player.isLoaded = true;
      //add label
      player.msg = "";
      player.label = new THREE.TextSprite({
        alignment: 'left',
        //color: '#'+Math.floor(Math.random()*16777215).toString(16),
        color: '#ffffff',
        fontFamily: '"FreePixel-Regular", sans-serif',
        fontSize: 5,
        fontStyle: 'normal',
        fontWeight: 'bold',
        text: player.msg
      });
      player.label.position.y = 20;
      player.object.add(player.label);

      if (player.deleted === undefined){
				game.scene.add(player.object);
			}
      if (player.local) {
        if(player.initSocket !== undefined){
          player.initSocket();
        }
      } else {
        player.object.userData.id = player.id;
        player.object.userData.remotePlayer = true;
        const players = game.initPlayers.splice(game.initPlayers.indexOf(this), 1);
        game.remotePlayers.push(players[0]);
      }
    });

  }

  update(dt) {
    this.mixer.update(dt);
    this.label.text = this.msg;

    if (this.game.remoteData.length > 0){
			let found = false;
			for(let data of this.game.remoteData){
				if (data.id != this.id) continue;
				//Found the player
				this.object.position.set( data.x, data.y, data.z );
				const euler = new THREE.Euler(data.pb, data.heading, data.pb);
				this.object.quaternion.setFromEuler( euler );
				this.msg = data.msg;
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

		if (players.length > 0){
			let index = game.remotePlayers.indexOf(players[0]);
			if (index!=-1){
				game.remotePlayers.splice( index, 1 );
				game.scene.remove(players[0].object);
			}
    }else{
        index = game.initPlayers.indexOf(data.id);
        if (index!=-1){
          const player = game.initPlayers[index];
          player.deleted = true;
          game.initPlayers.splice(index, 1);
        }
			}
		});

		this.socket = socket;
  }
  initSocket(){
		this.socket.emit('init', {
			model:this.model,
			color: this.color,
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
				msg: this.msg
			});
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
    //handle fake gravity
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
    this.label.text = this.msg;
    this.updateSocket();
  }
}
