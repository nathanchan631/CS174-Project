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
    Square, Luminscent_Shader, Texture_Shader_2D, Image_Shader_2D, Blend_Texture_Shader_2D, Blur_Texture_Shader_2D
} from './custom-defs.js'

import { Buffered_Texture } from './examples/shadow-demo-shaders.js'
import { Simulation, Test_Data, Body } from './collisions-demo.js';


const TEXTURE_BUFFER_SIZE = 2048;


export class Project extends Scene {
    constructor() {
        super();

        this.shapes = {
            sphere: new defs.Subdivision_Sphere(6),
            screen: new Square()
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
    
            ball2: new Material(new defs.Phong_Shader(), {
                color: color(0,1,0,1),
                ambient: 0.2,
                diffusivity: 0.6,
                specularity: 0.6
            })
        }

        this.player_transform = Mat4.translation(0, 5, 0);
        this.screen_transform = Mat4.translation(-1,-1,0).times(Mat4.scale(2,2,1));
        this.camera_location = Mat4.look_at(vec3(0, 0, 50), vec3(0, 0, 0), vec3(0, 1, 0));

        // To make sure texture initialization only does once
        this.init_ok = false;
    }

    // TODO: add a panel for jump
    make_control_panel() {
        // Draw the scene's buttons, setup their actions and keyboard shortcuts, and monitor live measurements.
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
        this.shapes.screen.draw(context, program_state, this.screen_transform, this.materials.background);
    }

    // anything here will not be blurred
    render_scene_normal(context, program_state) {

        // Draw the objects
        this.shapes.sphere.draw(context, program_state, this.player_transform, this.materials.ball);

        let ballT2 = Mat4.translation(0, -5, 0);
        this.shapes.sphere.draw(context, program_state, ballT2, this.materials.ball2); 
    }

    // render stuff to be blurred
    render_scene_blur(context, program_state) {
        this.shapes.sphere.draw(context, program_state, this.player_transform, this.materials.ball);
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
        program_state.set_camera(this.camera_location)


        // lights. TODO: change light position and color - maybe white centered on the ball?
        this.light_position = Mat4.rotation(t / 1000, 0, 1, 0).times(vec4(3, 6, 0, 1));
        this.light_color = color(
            0.667 + Math.sin(t/400) / 3,
            0.667 + Math.sin(t/1200) / 3,
            0.667 + Math.sin(t/3000) / 3,
            1
        );
        this.light_view_target = vec4(0, 0, 0, 1);
        this.light_field_of_view = 130 * Math.PI / 180; // 130 degrees

        program_state.lights = [new Light(this.light_position, this.light_color, 1000)];


        // MULTIPASS RENDERING

        // render background
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[3]);
        gl.viewport(0, 0, this.texture_size, this.texture_size);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.render_background(context, program_state);


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

        this.render_scene_blur(context, program_state);

        // Horizontal pass of Gaussian Blur
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[2]);
        gl.viewport(0, 0, this.texture_size, this.texture_size);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // display textures
        this.shapes.screen.draw(context, program_state, this.screen_transform,
            this.materials.blur_tex.override({texture: this.buffered_textures[1].texture_buffer_pointer, horizontal: true})
        );

        // Repeat with vertical pass
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[1]);
        gl.viewport(0, 0, this.texture_size, this.texture_size);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.shapes.screen.draw(context, program_state, this.screen_transform,
            this.materials.blur_tex.override({texture: this.buffered_textures[2].texture_buffer_pointer, horizontal: false})
        );


        // unbind, draw to the canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        program_state.view_mat = program_state.camera_inverse;
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 0.5, 500);

        this.shapes.screen.draw(context, program_state, this.screen_transform,
            this.materials.blend_tex.override({
                non_blurred_tex: this.buffered_textures[0].texture_buffer_pointer,
                blurred_tex: this.buffered_textures[1].texture_buffer_pointer,
                background_tex: this.buffered_textures[3].texture_buffer_pointer
            })
        )
    }
}


export class Inertia_Demo extends Simulation {
    // ** Inertia_Demo** demonstration: This scene lets random initial momentums
    // carry several bodies until they fall due to gravity and bounce.
    constructor() {
        super();
        this.data = new Test_Data();
        this.shapes = Object.assign({}, this.data.shapes);
        this.shapes.square = new defs.Square();
        const shader = new defs.Fake_Bump_Map(1);

        //movement
        this.jump = false;
        this.left = false;
        this.right = false;

        this.restart = false;

        this.material = new Material(shader, {
            color: color(1, 1, 1, 1),
            ambient: .5, texture: this.data.textures.black
        })
    }

    chosen_color() {
        //ball color
        return this.material.override(color(10, 1, 1, 1));
    }

    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate additional moving bodies if there ever aren't enough:
        while(this.user_sphere.length < 1)
            this.user_sphere.push(new Body(this.shapes.sphere, this.chosen_color(), vec3(1, 1 , 1))
                .emplace(Mat4.translation(...vec3(0, -8, 0)),
                    vec3(0, 0, 0).randomized(10).normalized(), 1));
                    

        for (let b of this.user_sphere) {
            // Gravity on Earth, where 1 unit in world space = 1 meter:
            b.linear_velocity[0] = 0;

            b.linear_velocity[2] = -1;
            if (this.jump == true)
            {
                b.linear_velocity[1] = 10;
                this.jump = false;
            }

            if (this.right == true)
            {
                b.linear_velocity[0] = 100;
                this.right = false;
            }
            if (this.left == true)
            {
                b.linear_velocity[0] = 100;
                this.left = false;
            }
            
            
            b.linear_velocity[1] += dt * -9.8;
            // If about to fall through floor, reverse y velocity:
            if (b.center[1] < -8 && b.linear_velocity[1] < 0)
                b.linear_velocity[1] = 0;

            

        }
        

        // Delete bodies that stop or stray too far away:
        if (this.restart)
        {
            this.user_sphere = this.user_sphere.filter(b => b.center.norm() < 0);
            this.restart = false;
        }
    }

    display(context, program_state) {
        // display(): Draw everything else in the scene besides the moving bodies.
        super.display(context, program_state);

        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            this.children.push(new defs.Program_State_Viewer());
            program_state.set_camera(Mat4.translation(0, 0, -50));    // Locate the camera here (inverted matrix).
        }
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 1, 500);
        program_state.lights = [new Light(vec4(0, -5, -10, 1), color(1, 1, 1, 1), 100000)];
        // Draw the ground:
        this.shapes.square.draw(context, program_state, Mat4.translation(0, -10, 0)
                .times(Mat4.rotation(Math.PI / 2, 1, 0, 0)).times(Mat4.scale(50, 50, 1)),
            this.material.override(this.data.textures.black));
    }
}