import {defs, tiny} from './examples/common.js';
const {vec3, vec4, vec, color, Matrix, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;
const {Cube, Axis_Arrows, Textured_Phong, Phong_Shader, Basic_Shader, Subdivision_Sphere} = defs


// Taken from https://github.com/Robert-Lu/tiny-graphics-shadow_demo
// 2D shape, to display the texture buffer
export class Square extends tiny.Vertex_Buffer {
    constructor() {
        super("position", "normal", "texture_coord");
        this.arrays.position = [
            vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0),
            vec3(1, 1, 0), vec3(1, 0, 0), vec3(0, 1, 0)
        ];
        this.arrays.normal = [
            vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1),
            vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1),
        ];
        this.arrays.texture_coord = [
            vec(0, 0), vec(1, 0), vec(0, 1),
            vec(1, 1), vec(1, 0), vec(0, 1)
        ]
    }
}


export class Texture_Shader_2D extends Shader {
    shared_glsl_code() {
        // ********* SHARED CODE, INCLUDED IN BOTH SHADERS *********
        return `
            precision mediump float;
            varying vec2 f_tex_coord;
        `;
    }

    vertex_glsl_code() {
        // ********* VERTEX SHADER *********
        return this.shared_glsl_code() + `
            attribute vec3 position, normal;                            
            // Position is expressed in object coordinates.
            attribute vec2 texture_coord;
            
            uniform mat4 model_transform;
            uniform mat4 projection_camera_model_transform;
    
            void main(){                                                                   
                // The vertex's final resting place (in NDCS):
                gl_Position = model_transform * vec4( position.xy, -1, 1.0 ); // <== only Model, no View
                f_tex_coord = texture_coord;
            } `;
    }

    fragment_glsl_code() {
        // ********* FRAGMENT SHADER *********
        // A fragment is a pixel that's overlapped by the current triangle.
        // Fragments affect the final image or get discarded due to depth.
        return this.shared_glsl_code() + `
            uniform sampler2D texture;

            void main(){
                vec3 col = texture2D( texture, f_tex_coord ).xyz;
                
                gl_FragColor = vec4( col, 1.0 );
            } `;
    }

    send_gpu_state(gl, gpu, gpu_state, model_transform) {
        // send_gpu_state():  Send the state of our whole drawing context to the GPU.
        // Send the current matrices to the shader.  Go ahead and pre-compute
        // the products we'll need of the of the three special matrices and just
        // cache and send those.  They will be the same throughout this draw
        // call, and thus across each instance of the vertex shader.
        // Transpose them since the GPU expects matrices as column-major arrays.
        const PCM = gpu_state.projection_transform.times(gpu_state.camera_inverse).times(model_transform);
        gl.uniformMatrix4fv(gpu.model_transform, false, Matrix.flatten_2D_to_1D(model_transform.transposed()));
        gl.uniformMatrix4fv(gpu.projection_camera_model_transform, false, Matrix.flatten_2D_to_1D(PCM.transposed()));
    }

    update_GPU(context, gpu_addresses, gpu_state, model_transform, material) {
        // update_GPU(): Add a little more to the base class's version of this method.

        this.send_gpu_state(context, gpu_addresses, gpu_state, model_transform);

        // set up texture 0, the non blurred texture
        context.uniform1i(gpu_addresses.texture, 0);
        context.activeTexture(context["TEXTURE" + 0]);
        context.bindTexture(context.TEXTURE_2D, material.texture);
    }
}


export class Image_Shader_2D extends Texture_Shader_2D {
    update_GPU(context, gpu_addresses, gpu_state, model_transform, material) {
        // update_GPU(): Add a little more to the base class's version of this method.

        this.send_gpu_state(context, gpu_addresses, gpu_state, model_transform);

        // set up texture 3, the background texture
        context.uniform1i(gpu_addresses.texture, 3);
        context.activeTexture(context["TEXTURE" + 3]);
        material.texture.activate(context, 3);
        // context.bindTexture(context.TEXTURE_2D, material.texture);
    }
}



export class Blend_Texture_Shader_2D extends Texture_Shader_2D {

    fragment_glsl_code() {
        // ********* FRAGMENT SHADER *********
        // A fragment is a pixel that's overlapped by the current triangle.
        // Fragments affect the final image or get discarded due to depth.
        return this.shared_glsl_code() + `
            uniform sampler2D non_blurred_tex;
            uniform sampler2D blurred_tex;
            uniform sampler2D background_tex;

            void main(){
                vec3 sceneColor = texture2D( non_blurred_tex, f_tex_coord ).xyz;
                if ( sceneColor == vec3(0.0, 0.0, 0.0) ) {
                    sceneColor = texture2D( background_tex, f_tex_coord ).xyz;
                }

                vec3 bloomColor = texture2D( blurred_tex, f_tex_coord ).xyz;
                
                gl_FragColor = vec4( sceneColor + bloomColor, 1.0 );
            } `;
    }

    update_GPU(context, gpu_addresses, gpu_state, model_transform, material) {
        // update_GPU(): Add a little more to the base class's version of this method.

        this.send_gpu_state(context, gpu_addresses, gpu_state, model_transform);

        // set up texture 0, the non blurred texture
        context.uniform1i(gpu_addresses.non_blurred_tex, 0);
        context.activeTexture(context["TEXTURE" + 0]);
        context.bindTexture(context.TEXTURE_2D, material.non_blurred_tex);

        // set up texture 1, the blurred texture
        context.uniform1i(gpu_addresses.blurred_tex, 1);
        context.activeTexture(context["TEXTURE" + 1]);
        context.bindTexture(context.TEXTURE_2D, material.blurred_tex);

        // set up texture 3, the background texture
        context.uniform1i(gpu_addresses.background_tex, 3);
        context.activeTexture(context["TEXTURE" + 3]);
        context.bindTexture(context.TEXTURE_2D, material.background_tex);
    }
}


export class Blur_Texture_Shader_2D extends Texture_Shader_2D {

    fragment_glsl_code() {
        // ********* FRAGMENT SHADER *********
        // A fragment is a pixel that's overlapped by the current triangle.
        // Fragments affect the final image or get discarded due to depth.
        return this.shared_glsl_code() + `
            uniform sampler2D texture;
            uniform float sigma;
            uniform float intercept;
            uniform vec2 blurDirection;

            float CalcGauss( float x ) {
                float coeff = 1.0 / (sqrt(2.0 * 3.14159) * sigma);
                float expon = -(x*x) / (2.0 * sigma);
                return (intercept + coeff*exp(expon));
            }

            void main(){
                // Sample the texture image in the correct place:
                vec4 tex_color = texture2D( texture, f_tex_coord );
                if( tex_color.w < .01 ) discard;

                vec2 textureSize = vec2( 1024.0, 512.0 );
                vec3 result = texture2D(texture, f_tex_coord).xyz * CalcGauss(0.0); // current fragment's contribution

                for(int i = 1; i < 8; ++i)
                {
                    vec2 offset = blurDirection * float(i) / textureSize; // divide by textureSize for texel size
                    float weight = CalcGauss( float(i) );
                    result += texture2D( texture, f_tex_coord + offset ).xyz * weight;
                    result += texture2D( texture, f_tex_coord - offset ).xyz * weight;
                }

                gl_FragColor = vec4( result, 1.0 );
            } `;
    }

    update_GPU(context, gpu_addresses, gpu_state, model_transform, material) {
        // update_GPU(): Add a little more to the base class's version of this method.
        const defaults = { horizontal: false, sigma: 2.4, intercept: 0.045 };
        material = Object.assign({}, defaults, material);

        this.send_gpu_state(context, gpu_addresses, gpu_state, model_transform);

        context.uniform1i(gpu_addresses.texture, 1); // 1 for blurred
        context.activeTexture(context["TEXTURE" + 1]);
        context.bindTexture(context.TEXTURE_2D, material.texture);

        context.uniform2fv(gpu_addresses.blurDirection, material.horizontal ? [1,0] : [0,1]);
        context.uniform1f(gpu_addresses.sigma, material.sigma);
        context.uniform1f(gpu_addresses.intercept, material.intercept);
    }
}


export class Luminscent_Shader extends Shader {

    shared_glsl_code() {
        // ********* SHARED CODE, INCLUDED IN BOTH SHADERS *********
        return ` precision mediump float;
            varying vec4 outColor;
        `;
    }

    // do calculations in vertex shader because interpolation is good enough here
    vertex_glsl_code() {
        // ********* VERTEX SHADER *********
        return this.shared_glsl_code() + `
            attribute vec3 position, normal;                            
            // Position is expressed in object coordinates.
            
            uniform mat4 model_transform;
            uniform mat4 projection_camera_model_transform;

            uniform vec4 color;
            uniform vec3 squared_scale, camera_center;
            uniform float shininess;
            uniform float u_glow;
            
            vec3 N, vertex_worldspace;
    
            void main(){                                                                   
                // The vertex's final resting place (in NDCS):
                gl_Position = projection_camera_model_transform * vec4( position, 1.0 );

                // The final normal vector in screen space.
                N = normalize( mat3( model_transform ) * normal / squared_scale);
                vertex_worldspace = ( model_transform * vec4( position, 1.0 ) ).xyz;

                vec3  normalV = normalize( N );
                vec3  lightV  = normalV;
                vec3  eyeV    = normalize( camera_center - vertex_worldspace );
                vec3  halfV   = normalize( eyeV + lightV );
                float NdotH   = max( 0.0, dot( normalV, halfV ) );
                float glowFac = ( shininess + 2.0 ) * pow( NdotH, shininess ) / ( 2.0 * 3.14159265 );
            
                outColor = vec4( u_glow * (0.1 + color.xyz * glowFac * 0.5), 1.0 );
            }
        `;
    }

    fragment_glsl_code() {
        // ********* FRAGMENT SHADER *********
        return this.shared_glsl_code() + `
            void main() {
                gl_FragColor = outColor;
            } `;
    }

    // Taken from defs.Phong_Shader
    send_gpu_state(gl, gpu, gpu_state, model_transform) {
        // send_gpu_state():  Send the state of our whole drawing context to the GPU.
        const O = vec4(0, 0, 0, 1), camera_center = gpu_state.camera_transform.times(O).to3();
        gl.uniform3fv(gpu.camera_center, camera_center);
        // Use the squared scale trick from "Eric's blog" instead of inverse transpose matrix:
        const squared_scale = model_transform.reduce(
            (acc, r) => {
                return acc.plus(vec4(...r).times_pairwise(r))
            }, vec4(0, 0, 0, 0)).to3();
        gl.uniform3fv(gpu.squared_scale, squared_scale);
        // Send the current matrices to the shader.  Go ahead and pre-compute
        // the products we'll need of the of the three special matrices and just
        // cache and send those.  They will be the same throughout this draw
        // call, and thus across each instance of the vertex shader.
        // Transpose them since the GPU expects matrices as column-major arrays.
        const PCM = gpu_state.projection_transform.times(gpu_state.camera_inverse).times(model_transform);
        gl.uniformMatrix4fv(gpu.model_transform, false, Matrix.flatten_2D_to_1D(model_transform.transposed()));
        gl.uniformMatrix4fv(gpu.projection_camera_model_transform, false, Matrix.flatten_2D_to_1D(PCM.transposed()));
    }

    update_GPU(context, gpu_addresses, gpu_state, model_transform, material) {
        // Fill in any missing fields in the Material object with custom defaults for this shader:
        const defaults = {color: color(1, 1, 1, 1), shininess: 10.0, glow: 10.0};
        material = Object.assign({}, defaults, material);

        context.uniform4fv(gpu_addresses.color, material.color);
        context.uniform1f(gpu_addresses.shininess, material.shininess);
        context.uniform1f(gpu_addresses.u_glow, material.glow);
        this.send_gpu_state(context, gpu_addresses, gpu_state, model_transform);
    }
}
