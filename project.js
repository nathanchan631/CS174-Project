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
    Luminscent_Shader, Texture_Shader_2D, Image_Shader_2D, Blend_Texture_Shader_2D, Blur_Texture_Shader_2D, Text_Shader_2D
} from './custom-defs.js'

import { Simulation } from './simulation.js';

import { Buffered_Texture } from './examples/shadow-demo-shaders.js'
import { Body } from './examples/collisions-demo.js';
import { Text_Line } from './examples/text-demo.js';


const TEXTURE_BUFFER_SIZE = 2048;


export class Project extends Simulation {
    constructor() {
        super();

        this.shapes = {
            sphere: new defs.Subdivision_Sphere(6),
            square: new defs.Square(),
            cube: new defs.Cube(),
            text: new Text_Line(50)
        };

        this.materials = {
            image_2d: new Material(new Image_Shader_2D(), {
                texture: null
            }),

            blur_tex: new Material(new Blur_Texture_Shader_2D()),
    
            blend_tex: new Material(new Blend_Texture_Shader_2D(), {
                blurred_tex: null,
                non_blurred_tex: null,
                background_tex: null,
            }),
    
            ball: new Material(new Luminscent_Shader(), {
                color: color(1, 0, 0, 1),
                shininess: 2.0,
                glow: 3.0
            }),
            ground: new Material(new defs.Phong_Shader(), {
                color: color(.2,.2,.2,1),
                ambient: 0.2,
                diffusivity: 1,
                specularity: 1
            }),
            path: new Material(new Luminscent_Shader(), {
                color: color(1, 1, 1, 1),
                shininess: 2.0,
                glow: 3.0
            }),
            text_image: new Material(new Text_Shader_2D(1), {
                texture: new Texture("assets/text.png")
            })
        }

        this.textures = {
            background: new Texture("assets/stars-galaxy.jpg"),
            pause_menu: new Texture("assets/paused.png"),
            completed_menu: new Texture("assets/complete.png"),
            text: new Texture("assets/text.png")
        }


        this.screen_transform = Mat4.identity();
        this.timer_transform = Mat4.translation(0.62, 0.85, 0).times(Mat4.scale(0.022, 0.05, 0.05))

        // Ground transforms for different paths
        this.platforms = [
            Mat4.translation(0, -2, 35).times(Mat4.scale(5, 1, 50)),                                        // Straight path
            Mat4.translation(40, -2, 155).times(Mat4.scale(10, 1, 70)).times(Mat4.shear(0,4,0,0,0,0)),      // Sheared left path
            Mat4.translation(110, -2, 235).times(Mat4.scale(40, 1, 10)),                                    // Straight Left path
            Mat4.translation(110, -2, 275).times(Mat4.scale(10, 1, 30)).times(Mat4.shear(0,-3,0,0,0,0)),    // Sheared Right path
            Mat4.translation(110, -2, 325).times(Mat4.scale(10, 1, 30)).times(Mat4.shear(0,3,0,0,0,0)),     // Sheared Right path
            Mat4.translation(140, -2, 385).times(Mat4.scale(10, 1, 30)),                                    // Straight
            Mat4.translation(110, -2, 445).times(Mat4.scale(10, 1, 30)).times(Mat4.shear(0,-3,0,0,0,0)),    // Sheared Right path
            Mat4.translation(65, -2, 485).times(Mat4.scale(25, 1, 10)),                                     // Straight Left path
            Mat4.translation(50, -2, 535).times(Mat4.scale(10, 1, 40)),                                     // Straight path
            Mat4.translation(25, -2, 605).times(Mat4.scale(10, 1, 30)).times(Mat4.shear(0,-2.5,0,0,0,0)),   // Sheared Right path
        ]

        this.ending = Mat4.translation(0, -2, 665).times(Mat4.scale(30, 1, 30));
        

        // To make sure texture initialization only happens once
        this.init_ok = false;

        // movement
        this.front = false;
        this.back = false;
        this.jump = false;
        this.left = false;
        this.right = false;
        this.fallingofflock = false;

        this.restart = false;

        this.floor_y = -0.35;

        this.last_reset = 0;
        this.ui_tex = this.textures.pause_menu;
        this.completed = false;
    }

    reset() {
        this.user_sphere = null;
        this.restart = false;
        this.front = false;
        this.back = false;
        this.right = false;
        this.left = false;

        this.last_reset = this.program_state.animation_time / 1000;
        this.ui_tex = this.textures.pause_menu;
        this.completed = false;
        this.program_state.animate = true;
    }

    make_control_panel() {
        // make_control_panel(): Create the buttons for interacting with simulation time.

        this.program_state = {};

        this.key_triggered_button("Restart", ["r"], () => this.reset());
        this.key_triggered_button("Pause/Resume", ["p"], () => { 
            if (!this.completed)
                this.program_state.animate ^= 1
        });

        // this.key_triggered_button("Speed up time", ["Shift", "T"], () => this.time_scale *= 5);
        // this.key_triggered_button("Slow down time", ["t"], () => this.time_scale /= 5);
        this.key_triggered_button("Jump", ["u"], () => this.jump = true);
        this.key_triggered_button("Forward", ["w"], () => this.front = true, '#6E6460', () => this.front = false);
        this.key_triggered_button("Forward", ["ArrowUp"], () => this.front = true, '#6E6460', () => this.front = false);
        this.key_triggered_button("Backward", ["s"], () => this.back = true, '#6E6460', () => this.back = false);
        this.key_triggered_button("Backward", ["ArrowDown"], () => this.back = true, '#6E6460', () => this.back = false);
        this.key_triggered_button("Right", ["d"], () => this.right = true, '#6E6460', () => this.right = false);
        this.key_triggered_button("Right", ["ArrowRight"], () => this.right = true, '#6E6460', () => this.right = false);
        this.key_triggered_button("Left", ["a"], () => this.left = true, '#6E6460', () => this.left = false);
        this.key_triggered_button("Left", ["ArrowLeft"], () => this.left = true, '#6E6460', () => this.left = false);
        
        // this.new_line();
        // this.live_string(box => {
        //     box.textContent = "Time scale: " + this.time_scale
        // });
        // this.new_line();
        // this.live_string(box => {
        //     box.textContent = "Fixed simulation time step size: " + this.dt
        // });
        // this.new_line();
        // this.live_string(box => {
        //     box.textContent = this.steps_taken + " timesteps were taken so far."
        // });
    }

    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate additional moving bodies if there ever aren't enough:
        if (this.user_sphere == null)
            this.user_sphere = new Body(this.shapes.sphere, this.materials.ball, vec3(0.65, 0.65, 0.65))
                .emplace(Mat4.translation(...vec3(0, 0, 0)), vec3(0, 0, 0), 0);
        
        
        while(this.bodies.length < 2)  
        {
            this.bodies.push(new Body(this.shapes.cube, this.materials.ball.override({color: color(0,1,0,1)}), vec3(1, 1, 1))
                .emplace(Mat4.translation(...vec3(-4, 0, 0)), vec3(-4, 4, 4), 0));
            this.bodies.push(new Body(this.shapes.sphere, this.materials.ball.override({color: color(0,0,1,1)}), vec3(1, 1, 1))
                .emplace(Mat4.translation(...vec3(4, 0, 0)), vec3(-4, 40, 4), 0));
        }


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
            this.user_sphere.linear_velocity[1] = 6.5;
            this.jump = false;
        }
        this.user_sphere.linear_velocity[1] += dt * -4.5;

        // If about to fall through floor, set y velocity to 0
        if (this.user_sphere.center[1] < this.floor_y && this.user_sphere.linear_velocity[1] < 0 && !this.fallingofflock)
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

        // collision with obstacles
        for (let b of this.bodies)
            if (this.user_sphere != null && this.user_sphere.check_if_colliding(b, collider))
                this.reset();

        // checking if on platform

        // this function solves player = backRightVec * x + frontLeftVec * y using Cramer's rule
        // and tests that x and y are between 0 and 1
        function playerOnPlatform(player, platform) {
            const backLeft = platform.times(vec4(-1, 1, 1, 1));

            const backRightVec = platform.times(vec4(1, 1, 1, 1)).minus(backLeft);
            const frontLeftVec = platform.times(vec4(-1, 1, -1, 1)).minus(backLeft);
            const playerVec = player.minus(backLeft);

            const determinant = backRightVec[0] * frontLeftVec[2] - backRightVec[2] * frontLeftVec[0];
            
            // The solution doesn't exist
            if (determinant === 0)
                return false;
            
        
            const detX = playerVec[0] * frontLeftVec[2] - playerVec[2] * frontLeftVec[0];
            const detY = backRightVec[0] * playerVec[2] - backRightVec[2] * playerVec[0];
        
            const x = detX / determinant;
            const y = detY / determinant;
        
            // Check if x and y are between 0 and 1
            return x >= 0 && x <= 1 && y >= 0 && y <= 1;
        }
        

        if (this.user_sphere != null) {
            // finished
            if (playerOnPlatform(this.user_sphere.center, this.ending)) {
                this.ui_tex = this.textures.completed_menu;
                this.program_state.animate = false;
                this.completed = true;
            }

            // not on any platforms
            else if (!this.platforms.some((platform) => playerOnPlatform(this.user_sphere.center, platform))) {

                this.fallingofflock = true;
                this.user_sphere.linear_velocity[1] += dt * -.1;
                setTimeout(() => {
                    this.reset();
                    this.fallingofflock = false;

                }, 500);
            }
        }
    }


    texture_buffer_init(gl) {

        // const ext = gl.getExtension("OES_texture_float");
        // if (!ext)
        //     throw new Error('Rendering to floating point textures is not supported on this platform');

        this.buffered_textures = [];
        this.framebuffers = [];
        this.texture_size = TEXTURE_BUFFER_SIZE;

        // 0 is for non blurred, 1 and 2 are for blurring, 3 is for 2d images (background, ui), 4 is for compositing
        for (let i = 0; i <= 3; i++) {

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
        this.shapes.square.draw(context, program_state, this.screen_transform, this.materials.image_2d.override({
            texture: this.textures.background
        }));
    }

    // anything here will not be blurred
    // IMPORTANT: Anything black will be clipped out. If you want, black, use color(.01,.01,.01,1) or something
    render_scene_normal(context, program_state) {

        // Draw the objects
        super.render_scene_normal(context, program_state); // draw simulation objects

        for (let platform of this.platforms)
            this.shapes.cube.draw(context, program_state, platform, this.materials.ground);

        this.shapes.cube.draw(context, program_state, this.ending, this.materials.path);


        // timer
        const time_elapsed = Math.floor(program_state.animation_time/1000 - this.last_reset);
        this.shapes.text.set_string("Time: " + time_elapsed + "s", context.context);
        this.shapes.text.draw(context, program_state, this.timer_transform, this.materials.text_image);
    }

    // render stuff to be blurred
    render_scene_blurred(context, program_state) {
        super.render_scene_blurred(context, program_state); // draw simulation objects
    }

    render_ui(context, program_state) {
        this.shapes.square.draw(context, program_state, this.screen_transform, this.materials.image_2d.override({
            texture: this.ui_tex
        }));
    }


    display(context, program_state) {
        const gl = context.context;

        // initialize texture buffer on first frame
        if (!this.init_ok) {
            this.texture_buffer_init(gl);
            this.init_ok = true;
        }

        if(this.user_sphere != null) {
            let camera_pos = this.user_sphere.center.plus([0, 3, -15]);
            program_state.set_camera(Mat4.look_at(camera_pos, camera_pos.plus(vec3(0, -1, 20)), vec3(0, 1, 0)))
        }
        

        this.player_light_position = this.user_sphere != null ? this.user_sphere.center.to4(1) : vec4(0,0,0,1);
        program_state.lights = [new Light(this.player_light_position, color(1, 0.8, 0.8, 1), 3)];

        for (let body of this.bodies) {
            program_state.lights.push(new Light(body.center.to4(1), body.material.color.times(0.5).plus([1,1,1]), 3));
        }

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

        
        if (this.program_state.animate) {

            // unbind, draw to the canvas
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            program_state.view_mat = program_state.camera_inverse;
            program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 0.5, 500);

            this.shapes.square.draw(context, program_state, this.screen_transform,
                this.materials.blend_tex.override({
                    non_blurred_tex: this.buffered_textures[0].texture_buffer_pointer,
                    blurred_tex: this.buffered_textures[1].texture_buffer_pointer,
                    background_tex: this.buffered_textures[3].texture_buffer_pointer,
                })
            )

        } else {
            // Combine textures
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[1]);
            gl.viewport(0, 0, this.texture_size, this.texture_size);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            this.shapes.square.draw(context, program_state, this.screen_transform,
                this.materials.blend_tex.override({
                    non_blurred_tex: this.buffered_textures[0].texture_buffer_pointer,
                    background_tex: this.buffered_textures[3].texture_buffer_pointer
                })
            )

            // blur again
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

            // Render UI
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[3]);
            gl.viewport(0, 0, this.texture_size, this.texture_size);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            this.render_ui(context, program_state);

            // Combine
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            program_state.view_mat = program_state.camera_inverse;
            program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 0.5, 500);

            this.shapes.square.draw(context, program_state, this.screen_transform,
                this.materials.blend_tex.override({
                    non_blurred_tex: this.buffered_textures[3].texture_buffer_pointer,
                    background_tex: this.buffered_textures[1].texture_buffer_pointer,
                })
            )
        }
    }
}
