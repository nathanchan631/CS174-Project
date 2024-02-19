import {defs, tiny} from './examples/common.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Scene,
} = tiny;


export class Project extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();

        // At the beginning of our program, load one of each of these shape definitions onto the GPU.
        this.shapes = {
            ball: new defs.Subdivision_Sphere(4),
        };

        // *** Materials
        this.materials = {
            ball: new Material(new defs.Phong_Shader(),
                {ambient: 0.1, diffusivity: 1, specularity: 1, color: color(1, 1, 1, 1)})
        }

        this.camera_location = Mat4.look_at(vec3(0, 10, 20), vec3(0, 0, 0), vec3(0, 1, 0));
    }

    make_control_panel() {
        // Draw the scene's buttons, setup their actions and keyboard shortcuts, and monitor live measurements.
        this.key_triggered_button("View scene", ["Control", "0"], () => this.attached = () => null);
        this.key_triggered_button("Attach to ball", ["Control", "1"], () => this.attached = () => this.ball_transform);
    }

    display(context, program_state) {
        // display():  Called once per frame of animation.
        // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
        }

        // Camera follow the ball
        if (this.attached != null && this.attached() != null) {
            let desired = Mat4.inverse(Mat4.translation(0, 0, 5).times(this.attached()));
            this.camera_location = desired.map((x,i) => Vector.from(program_state.camera_inverse[i]).mix(x, 0.1));
        }
        program_state.set_camera(this.camera_location);

        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, .1, 1000);

        const t = program_state.animation_time / 1000, dt = program_state.animation_delta_time / 1000;

        // Light at origin
        const light_position = vec4(0, 0, 10, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 1000)];


        // Object transformations
        this.ball_transform = Mat4.identity();

   
        // Draw objects
        this.shapes.ball.draw(context, program_state, this.ball_transform, this.materials.ball)
    }
}
