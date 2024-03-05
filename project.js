/* References:

https://learnopengl.com/Advanced-Lighting/Bloom
https://stackoverflow.com/questions/8166384/how-to-get-a-glow-shader-effect-in-opengl-es-2-0
https://github.com/Robert-Lu/tiny-graphics-shadow_demo


TODO: https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom
*/


import {defs, tiny} from './examples/common.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Texture, Scene,
} = tiny;

import {
    Luminscent_Shader, Texture_Shader_2D, Image_Shader_2D, Blend_Texture_Shader_2D, Blur_Texture_Shader_2D
} from './custom-defs.js'

import { Buffered_Texture } from './examples/shadow-demo-shaders.js'
import { Body } from './examples/collisions-demo.js';


const TEXTURE_BUFFER_SIZE = 2048;



// class that encapsulates all simulation objects and logic
export class Simulation extends Scene {
    // **Simulation** manages the stepping of simulation time.  Subclass it when making
    // a Scene that is a physics demo.  This technique is careful to totally decouple
    // the simulation from the frame rate (see below).
    constructor() {
        super();

        setInterval(() => {
            if (this.user_sphere != null) {
                console.log("Ball center:", this.user_sphere.center);
            }
        }, 3000); // Log every 3 seconds
        Object.assign(this, {time_accumulator: 0, time_scale: 1, t: 0, dt: 1 / 100, user_sphere: null, steps_taken: 0, bodies : []});
        
        // Make simpler dummy shapes for representing all other shapes during collisions:
        this.colliders = [
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(5), leeway: .1},
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(2), leeway: .1},
            {intersect_test: Body.intersect_cube, points: new defs.Cube(), leeway: .1}
        ];
        this.collider_selection = 0;
    }

    simulate(frame_time) {
        // simulate(): Carefully advance time according to Glenn Fiedler's
        // "Fix Your Timestep" blog post.
        // This line gives ourselves a way to trick the simulator into thinking
        // that the display framerate is running fast or slow:
        frame_time = this.time_scale * frame_time;

        // Avoid the spiral of death; limit the amount of time we will spend
        // computing during this timestep if display lags:
        this.time_accumulator += Math.min(frame_time, 0.1);
        // Repeatedly step the simulation until we're caught up with this frame:
        while (Math.abs(this.time_accumulator) >= this.dt) {
            // Single step of the simulation for all bodies:
            this.update_state(this.dt);
            if (this.user_sphere != null)
                this.user_sphere.advance(this.dt);
            // Following the advice of the article, de-couple
            // our simulation time from our frame rate:
            this.t += Math.sign(frame_time) * this.dt;
            this.time_accumulator -= Math.sign(frame_time) * this.dt;
            this.steps_taken++;
        }
        // Store an interpolation factor for how close our frame fell in between
        // the two latest simulation time steps, so we can correctly blend the
        // two latest states and display the result.
        let alpha = this.time_accumulator / this.dt;
        if (this.user_sphere != null)
            this.user_sphere.blend_state(alpha);
    }

    make_control_panel() {
        // make_control_panel(): Create the buttons for interacting with simulation time.
        this.key_triggered_button("Speed up time", ["Shift", "T"], () => this.time_scale *= 5);
        this.key_triggered_button("Slow down time", ["t"], () => this.time_scale /= 5);
        this.key_triggered_button("Jump", ["u"], () => this.jump = true);
        this.key_triggered_button("Forward", ["w"], () => this.front = true, '#6E6460', () => this.front = false);
        this.key_triggered_button("Forward", ["ArrowUp"], () => this.front = true, '#6E6460', () => this.front = false);
        this.key_triggered_button("Backward", ["s"], () => this.back = true, '#6E6460', () => this.back = false);
        this.key_triggered_button("Backward", ["ArrowDown"], () => this.back = true, '#6E6460', () => this.back = false);
        this.key_triggered_button("Right", ["d"], () => this.right = true, '#6E6460', () => this.right = false);
        this.key_triggered_button("Right", ["ArrowRight"], () => this.right = true, '#6E6460', () => this.right = false);
        this.key_triggered_button("Left", ["a"], () => this.left = true, '#6E6460', () => this.left = false);
        this.key_triggered_button("Left", ["ArrowLeft"], () => this.left = true, '#6E6460', () => this.left = false);
        
        this.key_triggered_button("Restart", ["r"], () => this.restart = true);
        this.new_line();
        this.live_string(box => {
            box.textContent = "Time scale: " + this.time_scale
        });
        this.new_line();
        this.live_string(box => {
            box.textContent = "Fixed simulation time step size: " + this.dt
        });
        this.new_line();
        this.live_string(box => {
            box.textContent = this.steps_taken + " timesteps were taken so far."
        });
    }

    display(context, program_state) {
        // display(): advance the time and state of our whole simulation.
        if (program_state.animate)
            this.simulate(program_state.animation_delta_time);
    }

    // objects that aren't blurred
    // IMPORTANT: Anything black will be clipped out. If you want, black, use color(.01,.01,.01,1) or something
    render_scene_normal(context, program_state) {
        if (this.user_sphere != null)
            this.user_sphere.shape.draw(context, program_state, this.user_sphere.drawn_location, this.user_sphere.material);

        for (let a of this.bodies)
            a.shape.draw(context, program_state, a.drawn_location, a.material);
    }

    // objects to be blurred. note some objects are drawn both blurred and not blurred
    render_scene_blurred(context, program_state) {
        if (this.user_sphere != null)
            this.user_sphere.shape.draw(context, program_state, this.user_sphere.drawn_location, this.user_sphere.material);

        for (let a of this.bodies)
            a.shape.draw(context, program_state, a.drawn_location, a.material);
    }

    update_state(dt)      // update_state(): Your subclass of Simulation has to override this abstract function.
    {
        throw "Override this"
    }
}


export class Project extends Simulation {
    constructor() {
        super();

        this.shapes = {
            sphere: new defs.Subdivision_Sphere(6),
            square: new defs.Square(),
            cube: new defs.Cube()
        };

        this.materials = {
            background: new Material(new Image_Shader_2D(), {
                texture: new Texture("assets/stars-galaxy.jpg")
            }),

            blur_tex: new Material(new Blur_Texture_Shader_2D()),
    
            blend_tex: new Material(new Blend_Texture_Shader_2D(), {
                blurred_tex: null,
                non_blurred_tex: null,
                background_tex: null
            }),
    
            ball: new Material(new Luminscent_Shader(), {
                color: color(1, 0, 0, 1),
                shininess: 2.0,
                glow: 3.0
            }),

            ground: new Material(new defs.Phong_Shader(), {
                color: color(.2,.2,.2,1),
                ambient: 0.2,
                diffusivity: 0.6,
                specularity: 0.6
            })
        }

        this.screen_transform = Mat4.identity();
        this.ground_transform = Mat4.translation(0,-2,75).times(Mat4.scale(8,1,80));

        // To make sure texture initialization only happens once
        this.init_ok = false;

        //movement
        this.front = false;
        this.back = false;
        this.jump = false;
        this.left = false;
        this.right = false;

        this.restart = false;

        this.floor_y = 0;
    }

    reset() {
        this.user_sphere = null;
        this.restart = false;
        this.front = false;
        this.back = false;
        this.right = false;
        this.left = false;
    }

    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate additional moving bodies if there ever aren't enough:
        if (this.user_sphere == null)
            this.user_sphere = new Body(this.shapes.sphere, this.materials.ball, vec3(0.65, 0.65, 0.65))
                .emplace(Mat4.translation(...vec3(0, 0, 0)), vec3(0, 0, 0), 0);
        
        while(this.bodies.length < 1)
            this.bodies.push(new Body(this.shapes.cube, this.materials.ball.override({color: color(0,1,0,1)}), vec3(0.65, 0.65, 0.65))
                .emplace(Mat4.translation(...vec3(5, 0, 0)), vec3(0, 0, 0), 0));


        // left, right, forward, backward
        let movement_speed = .4;

        if (this.left)
            this.user_sphere.linear_velocity[0] += dt * movement_speed;

        if (this.right)
            this.user_sphere.linear_velocity[0] -= dt * movement_speed;

        if (this.front)
            this.user_sphere.linear_velocity[2] += dt * movement_speed;
        
        if (this.back)
            this.user_sphere.linear_velocity[2] -= dt * movement_speed;


        // Gravity on Earth, where 1 unit in world space = 1 meter:
        if (this.jump == true && this.user_sphere.linear_velocity[1] == 0)
        {
            this.user_sphere.linear_velocity[1] = 10;
            this.jump = false;
        }
        this.user_sphere.linear_velocity[1] += dt * -9.8;

        // If about to fall through floor, set y velocity to 0
        if (this.user_sphere.center[1] < this.floor_y && this.user_sphere.linear_velocity[1] < 0)
            this.user_sphere.linear_velocity[1] = 0;

        
        // Delete bodies that stop or stray too far away:
        if (this.restart)
            this.reset();
        
        const collider = this.colliders[this.collider_selection];

        // Cache the inverse of matrix of the sphere body to save time.
        if (this.user_sphere != null)
            this.user_sphere.inverse = Mat4.inverse(this.user_sphere.drawn_location);

        // a.linear_velocity = a.linear_velocity.minus(a.center.times(dt));
        // Apply a small centripetal force to everything.
        // a.material = this.inactive_color;
        // // Default color: white

        // if (this.user_sphere.linear_velocity.norm() == 0)
        //     return;

        // TODO: this collision algorithm is really bad
        for (let b of this.bodies) {
            if (this.user_sphere != null && !this.user_sphere.check_if_colliding(b, collider))
                continue;

            this.reset();
        }
    }


    texture_buffer_init(gl) {

        // const ext = gl.getExtension("OES_texture_float");
        // if (!ext)
        //     throw new Error('Rendering to floating point textures is not supported on this platform');

        this.buffered_textures = [];
        this.framebuffers = [];
        this.texture_size = TEXTURE_BUFFER_SIZE;

        // 0 is for non blurred, 1 and 2 are for blurring, 3 is for background
        for (let i = 0; i < 4; i++) {

            // Framebuffer
            let fb = gl.createFramebuffer();
            fb.width = TEXTURE_BUFFER_SIZE;
            fb.height = TEXTURE_BUFFER_SIZE;
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

            // Texture
            fb.texture = gl.createTexture();
            let buffered_texture = new Buffered_Texture( fb.texture ); // bind it to tiny graphics
            gl.bindTexture( gl.TEXTURE_2D, fb.texture );
            // gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, fb.width, fb.height, 0, gl.RGBA, gl.FLOAT, null );
            gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, fb.width, fb.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null );
            gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
            gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
            gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
            gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );

            // texture color attachment
            gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fb.texture, 0 );

            // render buffer to store depth
            fb.renderbuffer = gl.createRenderbuffer();
            gl.bindRenderbuffer( gl.RENDERBUFFER, fb.renderbuffer );
            gl.renderbufferStorage( gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, fb.width, fb.height );
            gl.framebufferRenderbuffer( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fb.renderbuffer );

            gl.bindTexture( gl.TEXTURE_2D, null );
            gl.bindRenderbuffer( gl.RENDERBUFFER, null );
            gl.bindFramebuffer( gl.FRAMEBUFFER, null );

            this.buffered_textures.push(buffered_texture);
            this.framebuffers.push(fb);
        }
    }

    // render the background. Possible alternative: create a canvas under the tiny graphics one, make the tiny graphics one transparent
    render_background(context, program_state) {
        this.shapes.square.draw(context, program_state, this.screen_transform, this.materials.background);
    }

    // anything here will not be blurred
    // IMPORTANT: Anything black will be clipped out. If you want, black, use color(.01,.01,.01,1) or something
    render_scene_normal(context, program_state) {

        // Draw the objects
        super.render_scene_normal(context, program_state); // draw simulation objects
        this.shapes.cube.draw(context, program_state, this.ground_transform, this.materials.ground); // draw ground
    }

    // render stuff to be blurred
    render_scene_blurred(context, program_state) {
        super.render_scene_blurred(context, program_state); // draw simulation objects
    }


    display(context, program_state) {
        const t = program_state.animation_time / 1000, dt = program_state.animation_delta_time / 1000;
        const gl = context.context;

        // initialize texture buffer on first frame
        if (!this.init_ok) {
            this.texture_buffer_init(gl);
            this.init_ok = true;
        }
        
        // TODO: implement simulation with program state viewer
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Program_State_Viewer());
        }

        // TODO: Camera follow the ball
        if(this.user_sphere != null) {
            let camera_pos = this.user_sphere.center.plus([0, 3, -15]);
            program_state.set_camera(Mat4.look_at(camera_pos, camera_pos.plus(vec3(0, -1, 20)), vec3(0, 1, 0)))
        }
        


        // lights. TODO: change light position and color - maybe white centered on the ball?
        this.light_position = vec4(0,0,0,1);
        this.light_color = color(1,1,1,1);
        this.light_view_target = this.player_transform;
        this.light_field_of_view = 130 * Math.PI / 180; // 130 degrees

        program_state.lights = [new Light(this.light_position, this.light_color, 1000)];

        // one simulation step
        super.display(context, program_state);


        // MULTIPASS RENDERING

        // render background
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[3]);
        gl.viewport(0, 0, this.texture_size, this.texture_size);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.render_background(context, program_state);

        // TODO: For a platform glow, could find all black pixels that are close to a non black pixel
        // http://geoffprewett.com/blog/software/opengl-outline/
        
        // render all non blurred objects
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[0]);
        gl.viewport(0, 0, this.texture_size, this.texture_size);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        this.render_scene_normal(context, program_state);


        // Render the objects to be blurred

        // Bind the Depth Texture Buffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[1]);
        gl.viewport(0, 0, this.texture_size, this.texture_size);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.render_scene_blurred(context, program_state);

        // Horizontal pass of Gaussian Blur
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[2]);
        gl.viewport(0, 0, this.texture_size, this.texture_size);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // display textures
        this.shapes.square.draw(context, program_state, this.screen_transform,
            this.materials.blur_tex.override({texture: this.buffered_textures[1].texture_buffer_pointer, horizontal: true})
        );

        // Repeat with vertical pass
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[1]);
        gl.viewport(0, 0, this.texture_size, this.texture_size);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.shapes.square.draw(context, program_state, this.screen_transform,
            this.materials.blur_tex.override({texture: this.buffered_textures[2].texture_buffer_pointer, horizontal: false})
        );


        // unbind, draw to the canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        program_state.view_mat = program_state.camera_inverse;
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 0.5, 500);

        this.shapes.square.draw(context, program_state, this.screen_transform,
            this.materials.blend_tex.override({
                non_blurred_tex: this.buffered_textures[0].texture_buffer_pointer,
                blurred_tex: this.buffered_textures[1].texture_buffer_pointer,
                background_tex: this.buffered_textures[3].texture_buffer_pointer
            })
        )
    }
}
