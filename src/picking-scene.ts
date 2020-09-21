import { Scene, Mesh, Color, DirectionalLight, PerspectiveCamera,
  WebGLRenderer, WebGLRenderTarget, sRGBEncoding, NoToneMapping,
  MeshStandardMaterial, NoBlending, DoubleSide } from "three";

import { MeshBgSm } from "./common-types";

export class PickingScene {
  private _scene: Scene;
  private _target: WebGLRenderTarget;
  private _cameraLight: DirectionalLight;

  private _lastPickingColor = 0;
  private _materials: MeshStandardMaterial[] = [];
  private _releasedMaterials: MeshStandardMaterial[] = [];

  private _pickingMeshById = new Map<string, MeshBgSm>();
  private _sourceMeshByPickingColor = new Map<string, MeshBgSm>();

  constructor() {    
    const target = new WebGLRenderTarget(1, 1);

    const scene = new Scene();
    scene.background = new Color(0);

    const cameraLight = new DirectionalLight(0xFFFFFF, 1);
    cameraLight.position.set(-1, 2, 4);

    this._scene = scene;
    this._target = target;
    this._cameraLight = cameraLight;
  }

  destroy() {
    this._materials.forEach(x => x.dispose());
    this._materials = null;
    this._target.dispose();
    this._target = null;
  }
  
  add(sourceMesh: MeshBgSm) {
    const pickingMeshMaterial = this.getMaterial();
    const colorString = pickingMeshMaterial.color.getHex().toString(16);
    
    const pickingMesh = new Mesh(sourceMesh.geometry, pickingMeshMaterial);
    pickingMesh.userData.originalUuid = sourceMesh.uuid;
    pickingMesh.userData.color = colorString;
    pickingMesh.position.copy(sourceMesh.position);
    pickingMesh.rotation.copy(sourceMesh.rotation);
    pickingMesh.scale.copy(sourceMesh.scale);

    this._scene.add(pickingMesh);
    this._pickingMeshById.set(sourceMesh.uuid, pickingMesh);
    this._sourceMeshByPickingColor.set(colorString, sourceMesh);
  }

  remove(sourceMesh: MeshBgSm) {
    const pickingMesh = this._pickingMeshById.get(sourceMesh.uuid);
    if (pickingMesh) {
      this._scene.remove(pickingMesh);
      this._pickingMeshById.delete(sourceMesh.uuid);
      this._sourceMeshByPickingColor.delete(pickingMesh.userData.color);
      this.releaseMaterial(pickingMesh.material);
    }
  }

  getMeshAt(camera: PerspectiveCamera, renderer: WebGLRenderer, clientX: number, clientY: number): MeshBgSm { 
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (clientX - rect.left) * renderer.domElement.width / rect.width;
    const y = (clientY - rect.top) * renderer.domElement.height / rect.height;     
    const pixelRatio = renderer.getPixelRatio();
    camera.setViewOffset(
      renderer.getContext().drawingBufferWidth,
      renderer.getContext().drawingBufferHeight,
      x * pixelRatio || 0,
      y * pixelRatio || 0,
      1, 1);
    camera.add(this._cameraLight);
    renderer.setRenderTarget(this._target);
    renderer.render(this._scene, camera);

    // reset changes made to renderer and camera
    renderer.setRenderTarget(null);
    camera.clearViewOffset();
    camera.remove(this._cameraLight);    

    const pixelBuffer = new Uint8Array(4);
    renderer.readRenderTargetPixels(this._target, 0, 0, 1, 1, pixelBuffer); 
    // eslint-disable-next-line no-bitwise
    const hex = ((pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2])).toString(16);

    const mesh = this._sourceMeshByPickingColor.get(hex);
    return mesh;
  }
  
  private nextPickingColor(): number {
    if (this._lastPickingColor === 16777215) {
      this._lastPickingColor = 0;
    }
    return ++this._lastPickingColor;
  }
  
  private getMaterial(): MeshStandardMaterial {
    if (this._releasedMaterials.length) {
      return this._releasedMaterials.pop();
    }  

    const color = new Color(this.nextPickingColor());
    const material = new MeshStandardMaterial({ 
      color: color, 
      emissive: color,
      flatShading: true,
      blending: NoBlending,
      side: DoubleSide,      
      roughness: 1,
      metalness: 0,
    });
    this._materials.push(material);
    return material;
  }

  private releaseMaterial(material: MeshStandardMaterial) {
    this._releasedMaterials.push(material);
  }
}