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

import { Simulation } from './simulation.js';

import { Buffered_Texture } from './examples/shadow-demo-shaders.js'
import { Body } from './examples/collisions-demo.js';


const TEXTURE_BUFFER_SIZE = 2048;


export class Project extends Simulation {
    constructor() {
        super();

        this.shapes = {
            sphere: new defs.Subdivision_Sphere(6),
            square: new defs.Square(),
            cube: new defs.Cube(),
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
                diffusivity: 0.6,
                specularity: 0.6
            }),
            path: new Material(new defs.Phong_Shader(), { // Material for the path
                color: color(0.8, 0.8, 0.8, 1), // Reddish color
                ambient: 0.4,
                diffusivity: 0.6,
                specularity: 0.6
            }),
        }

        this.textures = {
            background: new Texture("assets/stars-galaxy.jpg"),
            pause_menu: new Texture("assets/paused.png")
        }

        this.screen_transform = Mat4.identity();

        // Ground transforms for different paths
        this.ground_transform = Mat4.translation(0, -2, 20).times(Mat4.scale(5, .2, 50)); // Straight path
        // this.ground_transform1 = Mat4.translation(40, -2, 215).times(Mat4.scale(10, 1, 70)).times(Mat4.shear(0,4,0,0,0,0)); // Sheared left path
        // this.ground_transform2 = Mat4.translation(110, -2, 295).times(Mat4.scale(40, 1, 10)); // Straight Left path
        // this.ground_transform3 = Mat4.translation(110, -2, 335).times(Mat4.scale(10, 1, 30)).times(Mat4.shear(0,-3,0,0,0,0)); // Sheared Right path
        // this.ground_transform4 = Mat4.translation(110, -2, 395).times(Mat4.scale(10, 1, 30)).times(Mat4.shear(0,3,0,0,0,0)); // Sheared Right path
        // this.ground_transform5 = Mat4.translation(140, -2, 455).times(Mat4.scale(10, 1, 30)); // Straight
        // this.ground_transform6 = Mat4.translation(110, -2, 515).times(Mat4.scale(10, 1, 30)).times(Mat4.shear(0,-3,0,0,0,0)); // Sheared Right path
        // this.ground_transform7 = Mat4.translation(65, -2, 555).times(Mat4.scale(25, 1, 10)); // Straight Left path
        // this.ground_transform8 = Mat4.translation(50, -2, 605).times(Mat4.scale(10, 1, 40)); // Straight path
        // this.ground_transform9 = Mat4.translation(25, -2, 675).times(Mat4.scale(10, 1, 30)).times(Mat4.shear(0,-2.5,0,0,0,0)); // Sheared Right path
        // this.ending = Mat4.translation(0, -2, 735).times(Mat4.scale(30, 1, 30));
        



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

        // TODO: this collision algorithm is really bad
        for (let b of this.bodies) {
            if (this.user_sphere != null && !this.user_sphere.check_if_colliding(b, collider))
                continue;

            this.reset();
        }


        //checking if on platform
        // console.log(this.ground_transform);

        // Extracting translation components
        const translationX = this.ground_transform[0][3]; // Translation along the X-axis
        const translationZ = this.ground_transform[2][3]; // Translation along the Z-axis

        // Extracting scaling components
        const scaleX = this.ground_transform[0][0]; // Scaling along the X-axis
        const scaleZ = this.ground_transform[2][2]; // Scaling along the Z-axis

        // Calculate x boundaries
        const minX = translationX - scaleX;
        const maxX = translationX + scaleX;

        // Calculate y boundaries
        const minZ = translationZ - scaleZ - 5;
        const maxZ = translationZ + scaleZ - 5;


        if(this.user_sphere != null)
        {
            if(this.user_sphere.center[0] > maxX || this.user_sphere.center[0]<minX)
            {
                this.fallingofflock = true;
                this.user_sphere.linear_velocity[1] += dt * -.1;
                setTimeout(() => {
                    this.reset();
                    this.fallingofflock = false;

                }, 500);
            }
            else if(this.user_sphere.center[2] > maxZ || this.user_sphere.center[2] <minZ)
            {
                this.fallingofflock = true;
                this.user_sphere.linear_velocity[1] += dt * -.1;
                setTimeout(() => {
                    this.reset();
                    this.fallingofflock = false;
                }, 600);
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

        // 0 is for non blurred, 1 and 2 are for blurring, 3 is for 2d images (background, ui)
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
        this.shapes.cube.draw(context, program_state, this.ground_transform, this.materials.ground);
        // this.shapes.cube.draw(context, program_state, this.ground_transform1, this.materials.ground);
        // this.shapes.cube.draw(context, program_state, this.ground_transform2, this.materials.ground);
        // this.shapes.cube.draw(context, program_state, this.ground_transform3, this.materials.ground);
        // this.shapes.cube.draw(context, program_state, this.ground_transform4, this.materials.ground);
        // this.shapes.cube.draw(context, program_state, this.ground_transform5, this.materials.ground);
        // this.shapes.cube.draw(context, program_state, this.ground_transform6, this.materials.ground);
        // this.shapes.cube.draw(context, program_state, this.ground_transform7, this.materials.ground);
        // this.shapes.cube.draw(context, program_state, this.ground_transform8, this.materials.ground);
        // this.shapes.cube.draw(context, program_state, this.ground_transform9, this.materials.ground);
        // this.shapes.cube.draw(context, program_state, this.ending, this.materials.path);
    }

    // render stuff to be blurred
    render_scene_blurred(context, program_state) {
        super.render_scene_blurred(context, program_state); // draw simulation objects
    }

    render_ui(context, program_state) {
        this.shapes.square.draw(context, program_state, this.screen_transform, this.materials.image_2d.override({
            texture: this.textures.pause_menu
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
