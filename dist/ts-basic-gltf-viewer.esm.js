import { BehaviorSubject, Subject, AsyncSubject } from 'rxjs';
import { first } from 'rxjs/operators';
import { Color, MeshPhysicalMaterial, NormalBlending, DoubleSide, MeshPhongMaterial, Scene, Mesh, Uint32BufferAttribute, Uint8BufferAttribute, Float32BufferAttribute, BufferGeometry, Box3, WebGLRenderTarget, MeshBasicMaterial, NoBlending, PerspectiveCamera, Vector3, AmbientLight, HemisphereLight, DirectionalLight, WebGLRenderer, sRGBEncoding, NoToneMapping, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { ResizeSensor } from 'css-element-queries';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

class PointerEventHelper {
    static get default() {
        return {
            downX: null,
            downY: null,
            maxDiff: 10,
            mouseMoveTimer: null,
            waitForDouble: false
        };
    }
}

class ColorRgbRmo {
    constructor(r, g, b, roughness, metalness, opacity) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.roughness = roughness;
        this.metalness = metalness;
        this.opacity = opacity;
    }
    get rByte() {
        return this.r * 255;
    }
    get gByte() {
        return this.g * 255;
    }
    get bByte() {
        return this.b * 255;
    }
    get roughnessByte() {
        return this.roughness * 255;
    }
    get metalnessByte() {
        return this.metalness * 255;
    }
    get opacityByte() {
        return this.opacity * 255;
    }
    static createFromMaterial(material) {
        return new ColorRgbRmo(material.color.r, material.color.g, material.color.b, material.roughness, material.metalness, material.opacity);
    }
    static deleteFromMesh(mesh, deleteCustom = false, deleteDefault = false) {
        mesh[ColorRgbRmo.prop] = null;
        if (deleteCustom) {
            mesh[ColorRgbRmo.customProp] = null;
        }
        if (deleteDefault) {
            mesh[ColorRgbRmo.defaultProp] = null;
        }
    }
    static getDefaultFromMesh(mesh) {
        if (!mesh[ColorRgbRmo.defaultProp]) {
            mesh[ColorRgbRmo.defaultProp] = ColorRgbRmo.createFromMaterial(mesh.material);
        }
        return mesh[ColorRgbRmo.defaultProp];
    }
    static getCustomFromMesh(mesh) {
        return mesh[ColorRgbRmo.customProp];
    }
    static getFromMesh(mesh) {
        if (mesh[ColorRgbRmo.prop]) {
            return mesh[ColorRgbRmo.prop];
        }
        if (mesh[ColorRgbRmo.customProp]) {
            return mesh[ColorRgbRmo.customProp];
        }
        return ColorRgbRmo.getDefaultFromMesh(mesh);
    }
    static setCustomToMesh(mesh, rgbRmo) {
        mesh[ColorRgbRmo.customProp] = rgbRmo;
    }
    static setToMesh(mesh, rgbRmo) {
        mesh[ColorRgbRmo.prop] = rgbRmo;
    }
    toString() {
        return `${this.r}|${this.g}|${this.b}|${this.roughness}|${this.metalness}|${this.opacity}`;
    }
}
ColorRgbRmo.prop = "rgbrmo";
ColorRgbRmo.customProp = "rgbrmoC";
ColorRgbRmo.defaultProp = "rgbrmoD";
class ColorRgbRmoUtils {
    constructor(isolationColor, isolationOpacity, selectionColor, highlightColor) {
        this._materials = new Map();
        this._isolationColor = this.buildIsolationColor(isolationColor, isolationOpacity);
        this._selectionColor = new Color(selectionColor);
        this._highlightColor = new Color(highlightColor);
        this._globalMaterial = this.buildGlobalMaterial();
        this._simpleMaterial = this.buildSimpleMaterial();
    }
    get globalMaterial() {
        return this._globalMaterial;
    }
    get simpleMaterial() {
        return this._simpleMaterial;
    }
    get materials() {
        return [...this._materials.values()];
    }
    updateColors(isolationColor, isolationOpacity, selectionColor, highlightColor) {
        this._isolationColor = this.buildIsolationColor(isolationColor, isolationOpacity);
        this._selectionColor = new Color(selectionColor);
        this._highlightColor = new Color(highlightColor);
    }
    updateMaterials() {
        this._globalMaterial.needsUpdate = true;
        this._simpleMaterial.needsUpdate = true;
        this._materials.forEach(v => v.needsUpdate = true);
    }
    destroy() {
        this._globalMaterial.dispose();
        this._globalMaterial = null;
        this._simpleMaterial.dispose();
        this._simpleMaterial = null;
        this._materials.forEach(v => v.dispose());
        this._materials = null;
    }
    refreshMeshColors(mesh) {
        const initialRgbRmo = ColorRgbRmo.getFromMesh(mesh);
        if (!mesh.userData.isolated) {
            ColorRgbRmo.deleteFromMesh(mesh);
        }
        const baseRgbRmo = ColorRgbRmo.getFromMesh(mesh);
        let newRgbRmo;
        if (mesh.userData.highlighted) {
            newRgbRmo = new ColorRgbRmo(this._highlightColor.r, this._highlightColor.g, this._highlightColor.b, baseRgbRmo.roughness, baseRgbRmo.metalness, baseRgbRmo.opacity);
        }
        else if (mesh.userData.selected) {
            newRgbRmo = new ColorRgbRmo(this._selectionColor.r, this._selectionColor.g, this._selectionColor.b, baseRgbRmo.roughness, baseRgbRmo.metalness, baseRgbRmo.opacity);
        }
        else if (mesh.userData.isolated) {
            newRgbRmo = this._isolationColor;
        }
        else {
            newRgbRmo = baseRgbRmo;
        }
        ColorRgbRmo.setToMesh(mesh, newRgbRmo);
        return {
            rgbRmo: newRgbRmo,
            opacityChanged: newRgbRmo.opacity !== initialRgbRmo.opacity,
        };
    }
    getMaterial(rgbRmo) {
        const key = rgbRmo.toString();
        if (this._materials.has(key)) {
            return this._materials.get(key);
        }
        const material = this.buildStandardMaterial(rgbRmo);
        this._materials.set(key, material);
        return material;
    }
    buildIsolationColor(hex, opacity) {
        const isolationColor = new Color(hex);
        const isolationColorRgbRmo = new ColorRgbRmo(isolationColor.r, isolationColor.g, isolationColor.b, 1, 0, opacity);
        return isolationColorRgbRmo;
    }
    buildGlobalMaterial() {
        const material = new MeshPhysicalMaterial({
            vertexColors: true,
            flatShading: true,
            blending: NormalBlending,
            side: DoubleSide,
            transparent: true,
        });
        material.onBeforeCompile = shader => {
            shader.vertexShader =
                `
        attribute vec3 rmo;        
        varying float roughness;
        varying float metalness;
        varying float opacity;
        `
                    + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace("void main() {", `
        void main() {
          roughness = rmo.x;
          metalness = rmo.y;
          opacity = rmo.z;
        `);
            shader.fragmentShader = shader.fragmentShader.replace("uniform float roughness;", "varying float roughness;");
            shader.fragmentShader = shader.fragmentShader.replace("uniform float metalness;", "varying float metalness;");
            shader.fragmentShader = shader.fragmentShader.replace("uniform float opacity;", "varying float opacity;");
        };
        return material;
    }
    buildSimpleMaterial() {
        const material = new MeshPhongMaterial({
            color: 0x808080,
            transparent: false,
            flatShading: true,
            blending: NormalBlending,
            side: DoubleSide,
        });
        return material;
    }
    buildStandardMaterial(rgbRmo) {
        const material = new MeshPhysicalMaterial({
            blending: NormalBlending,
            side: DoubleSide,
            flatShading: true,
            color: new Color(rgbRmo.r, rgbRmo.g, rgbRmo.b),
            transparent: rgbRmo.opacity !== 1,
            roughness: rgbRmo.roughness,
            metalness: rgbRmo.metalness,
            opacity: rgbRmo.opacity,
        });
        return material;
    }
}

var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class RenderScene {
    constructor(colorRgbRmoUtils) {
        this._geometries = [];
        this._geometryIndexBySourceMesh = new Map();
        this._sourceMeshesByGeometryIndex = new Map();
        this._renderMeshBySourceMesh = new Map();
        this._geometryIndicesNeedSort = new Set();
        if (!colorRgbRmoUtils) {
            throw new Error("ColorRgbRmoUtils is undefined!");
        }
        this._colorRgbRmoUtils = colorRgbRmoUtils;
    }
    get scene() {
        return this._scene;
    }
    get geometries() {
        return this._geometries;
    }
    destroy() {
        var _a;
        (_a = this._geometries) === null || _a === void 0 ? void 0 : _a.forEach(x => x.geometry.dispose());
        this._geometries = null;
        this._scene = null;
    }
    updateSceneAsync(lights, meshes, models, meshMergeType) {
        return __awaiter(this, void 0, void 0, function* () {
            this._scene = null;
            const scene = new Scene();
            scene.add(...lights);
            this._geometries.forEach(x => x.geometry.dispose());
            this._geometries.length = 0;
            this._geometryIndexBySourceMesh.clear();
            this._sourceMeshesByGeometryIndex.clear();
            this._renderMeshBySourceMesh.clear();
            this._geometryIndicesNeedSort.clear();
            if (meshMergeType) {
                const meshGroups = yield this.groupModelMeshesByMergeType(meshes, models, meshMergeType);
                for (const meshGroup of meshGroups) {
                    if (meshGroup.length) {
                        const geometry = yield this.buildRenderGeometryAsync(meshGroup);
                        if (!geometry) {
                            continue;
                        }
                        this._geometries.push(geometry);
                        const i = this._geometries.length - 1;
                        this._sourceMeshesByGeometryIndex.set(i, meshGroup);
                        this._geometryIndicesNeedSort.add(i);
                        meshGroup.forEach(x => {
                            this._geometryIndexBySourceMesh.set(x, i);
                        });
                    }
                }
                this._geometries.forEach(x => {
                    const mesh = new Mesh(x.geometry, this._colorRgbRmoUtils.globalMaterial);
                    scene.add(mesh);
                });
            }
            else {
                meshes.forEach(sourceMesh => {
                    const rgbRmo = ColorRgbRmo.getFromMesh(sourceMesh);
                    const material = this._colorRgbRmoUtils.getMaterial(rgbRmo);
                    const renderMesh = new Mesh(sourceMesh.geometry, material);
                    renderMesh.applyMatrix4(sourceMesh.matrix);
                    this._renderMeshBySourceMesh.set(sourceMesh, renderMesh);
                    scene.add(renderMesh);
                });
            }
            this._currentMergeType = meshMergeType;
            this._scene = scene;
        });
    }
    updateMeshColors(sourceMeshes) {
        if (this._currentMergeType) {
            this.updateMeshGeometryColors(sourceMeshes);
        }
        else {
            this.updateMeshMaterials(sourceMeshes);
        }
        this.sortGeometryIndicesByOpacity();
    }
    groupModelMeshesByMergeType(meshes, models, meshMergeType) {
        return __awaiter(this, void 0, void 0, function* () {
            let grouppedMeshes;
            switch (meshMergeType) {
                case "scene":
                    grouppedMeshes = [meshes];
                    break;
                case "model":
                    grouppedMeshes = models.map(x => x.meshes).filter(x => x.length);
                    break;
                case "model+":
                    grouppedMeshes = [];
                    const chunkSize = 1000;
                    models.map(x => x.meshes).filter(x => x.length).forEach(x => {
                        if (x.length <= chunkSize) {
                            grouppedMeshes.push(x);
                        }
                        else {
                            for (let i = 0; i < x.length; i += chunkSize) {
                                const chunk = x.slice(i, i + chunkSize);
                                grouppedMeshes.push(chunk);
                            }
                        }
                    });
                    break;
                default:
                    grouppedMeshes = [];
            }
            return grouppedMeshes;
        });
    }
    buildRenderGeometryAsync(meshes) {
        return __awaiter(this, void 0, void 0, function* () {
            let positionsLen = 0;
            let indicesLen = 0;
            meshes.forEach(x => {
                positionsLen += x.geometry.getAttribute("position").count * 3;
                indicesLen += x.geometry.getIndex().count;
            });
            if (positionsLen === 0) {
                return null;
            }
            const indexBuffer = new Uint32BufferAttribute(new Uint32Array(indicesLen), 1);
            const colorBuffer = new Uint8BufferAttribute(new Uint8Array(positionsLen), 3, true);
            const rmoBuffer = new Uint8BufferAttribute(new Uint8Array(positionsLen), 3, true);
            const positionBuffer = new Float32BufferAttribute(new Float32Array(positionsLen), 3);
            const indicesBySourceMesh = new Map();
            let positionsOffset = 0;
            let indicesOffset = 0;
            const chunkSize = 100;
            const processChunk = (chunk) => {
                chunk.forEach(x => {
                    const geometry = x.geometry
                        .clone()
                        .applyMatrix4(x.matrix);
                    const positions = geometry.getAttribute("position").array;
                    const indices = geometry.getIndex().array;
                    const meshIndices = new Uint32Array(indices.length);
                    indicesBySourceMesh.set(x, meshIndices);
                    for (let i = 0; i < indices.length; i++) {
                        const index = indices[i] + positionsOffset;
                        indexBuffer.setX(indicesOffset++, index);
                        meshIndices[i] = index;
                    }
                    for (let i = 0; i < positions.length;) {
                        const rgbrmo = ColorRgbRmo.getFromMesh(x);
                        colorBuffer.setXYZ(positionsOffset, rgbrmo.rByte, rgbrmo.gByte, rgbrmo.bByte);
                        rmoBuffer.setXYZ(positionsOffset, rgbrmo.roughnessByte, rgbrmo.metalnessByte, rgbrmo.opacityByte);
                        positionBuffer.setXYZ(positionsOffset++, positions[i++], positions[i++], positions[i++]);
                    }
                    geometry.dispose();
                });
            };
            for (let i = 0; i < meshes.length; i += chunkSize) {
                yield new Promise((resolve) => {
                    setTimeout(() => {
                        processChunk(meshes.slice(i, i + chunkSize));
                        resolve();
                    }, 0);
                });
            }
            const renderGeometry = new BufferGeometry();
            renderGeometry.setIndex(indexBuffer);
            renderGeometry.setAttribute("color", colorBuffer);
            renderGeometry.setAttribute("rmo", rmoBuffer);
            renderGeometry.setAttribute("position", positionBuffer);
            return {
                geometry: renderGeometry,
                positions: positionBuffer,
                colors: colorBuffer,
                rmos: rmoBuffer,
                indices: indexBuffer,
                indicesBySourceMesh,
            };
        });
    }
    updateMeshMaterials(sourceMeshes) {
        sourceMeshes.forEach((sourceMesh) => {
            const { rgbRmo } = this._colorRgbRmoUtils.refreshMeshColors(sourceMesh);
            const material = this._colorRgbRmoUtils.getMaterial(rgbRmo);
            const renderMesh = this._renderMeshBySourceMesh.get(sourceMesh);
            renderMesh.material = material;
        });
    }
    updateMeshGeometryColors(sourceMeshes) {
        const meshesByRgIndex = new Map();
        sourceMeshes.forEach((mesh) => {
            const rgIndex = this._geometryIndexBySourceMesh.get(mesh);
            if (meshesByRgIndex.has(rgIndex)) {
                meshesByRgIndex.get(rgIndex).push(mesh);
            }
            else {
                meshesByRgIndex.set(rgIndex, [mesh]);
            }
        });
        meshesByRgIndex.forEach((v, k) => {
            this.updateGeometryColors(k, v);
        });
    }
    updateGeometryColors(rgIndex, meshes) {
        const { colors, rmos, indicesBySourceMesh } = this._geometries[rgIndex];
        let anyMeshOpacityChanged = false;
        meshes.forEach(mesh => {
            const { rgbRmo, opacityChanged } = this._colorRgbRmoUtils
                .refreshMeshColors(mesh);
            indicesBySourceMesh.get(mesh).forEach(i => {
                colors.setXYZ(i, rgbRmo.rByte, rgbRmo.gByte, rgbRmo.bByte);
                rmos.setXYZ(i, rgbRmo.roughnessByte, rgbRmo.metalnessByte, rgbRmo.opacityByte);
            });
            if (!anyMeshOpacityChanged && opacityChanged) {
                anyMeshOpacityChanged = true;
            }
        });
        colors.needsUpdate = true;
        rmos.needsUpdate = true;
        if (anyMeshOpacityChanged) {
            this._geometryIndicesNeedSort.add(rgIndex);
        }
    }
    sortGeometryIndicesByOpacity() {
        this._geometryIndicesNeedSort.forEach(i => {
            const meshes = this._sourceMeshesByGeometryIndex.get(i);
            const opaqueMeshes = [];
            const transparentMeshes = [];
            meshes.forEach(x => {
                if (ColorRgbRmo.getFromMesh(x).opacity === 1) {
                    opaqueMeshes.push(x);
                }
                else {
                    transparentMeshes.push(x);
                }
            });
            const { indices, indicesBySourceMesh } = this._geometries[i];
            let currentIndex = 0;
            opaqueMeshes.forEach(mesh => {
                indicesBySourceMesh.get(mesh).forEach(value => {
                    indices.setX(currentIndex++, value);
                });
            });
            transparentMeshes.forEach(mesh => {
                indicesBySourceMesh.get(mesh).forEach(value => {
                    indices.setX(currentIndex++, value);
                });
            });
            indices.needsUpdate = true;
        });
        this._geometryIndicesNeedSort.clear();
    }
}

var __awaiter$1 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class SimplifiedScene {
    constructor(colorRgbRmoUtils) {
        this._boxIndices = [
            0, 1, 3,
            3, 1, 2,
            1, 5, 2,
            2, 5, 6,
            5, 4, 6,
            6, 4, 7,
            4, 0, 7,
            7, 0, 3,
            3, 2, 7,
            7, 2, 6,
            4, 5, 0,
            0, 5, 1,
        ];
        this._geometries = [];
        if (!colorRgbRmoUtils) {
            throw new Error("ColorRgbRmoUtils is undefined!");
        }
        this._colorRgbRmoUtils = colorRgbRmoUtils;
    }
    get scene() {
        return this._scene;
    }
    get geometries() {
        return this._geometries;
    }
    destroy() {
        var _a;
        (_a = this._geometries) === null || _a === void 0 ? void 0 : _a.forEach(x => x.dispose());
        this._geometries = null;
        this._scene = null;
    }
    clearScene() {
        this._scene = null;
    }
    updateSceneAsync(lights, meshes, fastRenderType) {
        return __awaiter$1(this, void 0, void 0, function* () {
            this._scene = null;
            const scene = new Scene();
            scene.add(...lights);
            this._geometries.forEach(x => x.dispose());
            this._geometries.length = 0;
            let geometry;
            switch (fastRenderType) {
                case "ch":
                    geometry = yield this.buildHullGeometryAsync(meshes);
                    break;
                case "aabb":
                    geometry = yield this.buildBoxGeometryAsync(meshes);
                    break;
                case "ombb":
                default:
                    throw new Error("Render type not implemented");
            }
            if (geometry) {
                this._geometries.push(geometry);
            }
            this._geometries.forEach(x => {
                const mesh = new Mesh(x, this._colorRgbRmoUtils.simpleMaterial);
                scene.add(mesh);
            });
            this._scene = scene;
        });
    }
    buildHullGeometryAsync(meshes) {
        return __awaiter$1(this, void 0, void 0, function* () {
            if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
                return null;
            }
            const hullPoints = [];
            const hullChunkSize = 100;
            const hullChunk = (chunk) => {
                chunk.forEach(x => {
                    const hull = new ConvexHull().setFromObject(x);
                    hull.faces.forEach(f => {
                        let edge = f.edge;
                        do {
                            hullPoints.push(edge.head().point);
                            edge = edge.next;
                        } while (edge !== f.edge);
                    });
                });
            };
            for (let i = 0; i < meshes.length; i += hullChunkSize) {
                yield new Promise((resolve) => {
                    setTimeout(() => {
                        hullChunk(meshes.slice(i, i + hullChunkSize));
                        resolve();
                    }, 0);
                });
            }
            const indexArray = new Uint32Array(hullPoints.length);
            let currentIndex = 0;
            const indexByKey = new Map();
            const uniquePoints = [];
            hullPoints.forEach((x, i) => {
                const key = `${x.x}|${x.y}|${x.z}`;
                if (!indexByKey.has(key)) {
                    indexArray[i] = currentIndex;
                    indexByKey.set(key, currentIndex++);
                    uniquePoints.push(x);
                }
                else {
                    indexArray[i] = indexByKey.get(key);
                }
            });
            const positionArray = new Float32Array(uniquePoints.length * 3);
            let currentPosition = 0;
            uniquePoints.forEach(x => {
                positionArray[currentPosition++] = x.x;
                positionArray[currentPosition++] = x.y;
                positionArray[currentPosition++] = x.z;
            });
            const positionBuffer = new Float32BufferAttribute(positionArray, 3);
            const indexBuffer = new Uint32BufferAttribute(indexArray, 1);
            const outputGeometry = new BufferGeometry();
            outputGeometry.setAttribute("position", positionBuffer);
            outputGeometry.setIndex(indexBuffer);
            return outputGeometry;
        });
    }
    buildBoxGeometryAsync(meshes) {
        return __awaiter$1(this, void 0, void 0, function* () {
            if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
                return null;
            }
            const positionArray = new Float32Array(meshes.length * 8 * 3);
            const indexArray = new Uint32Array(meshes.length * 12 * 3);
            let positionsOffset = 0;
            let indicesOffset = 0;
            const chunkSize = 100;
            const processChunk = (chunk) => {
                chunk.forEach(x => {
                    const boxPositions = this.getMeshBoxPositions(x);
                    const indexPositionOffset = positionsOffset / 3;
                    for (let i = 0; i < boxPositions.length; i++) {
                        positionArray[positionsOffset++] = boxPositions[i];
                    }
                    this._boxIndices.forEach(i => indexArray[indicesOffset++] = indexPositionOffset + i);
                });
            };
            for (let i = 0; i < meshes.length; i += chunkSize) {
                yield new Promise((resolve) => {
                    setTimeout(() => {
                        processChunk(meshes.slice(i, i + chunkSize));
                        resolve();
                    }, 0);
                });
            }
            const positionBuffer = new Float32BufferAttribute(positionArray, 3);
            const indexBuffer = new Uint32BufferAttribute(indexArray, 1);
            const outputGeometry = new BufferGeometry();
            outputGeometry.setAttribute("position", positionBuffer);
            outputGeometry.setIndex(indexBuffer);
            return outputGeometry;
        });
    }
    getMeshBoxPositions(mesh) {
        const box = new Box3().setFromBufferAttribute(mesh.geometry.getAttribute("position"));
        const boxPositionArray = new Float32Array(24);
        boxPositionArray[0] = box.min.x;
        boxPositionArray[1] = box.min.y;
        boxPositionArray[2] = box.max.z;
        boxPositionArray[3] = box.max.x;
        boxPositionArray[4] = box.min.y;
        boxPositionArray[5] = box.max.z;
        boxPositionArray[6] = box.max.x;
        boxPositionArray[7] = box.max.y;
        boxPositionArray[8] = box.max.z;
        boxPositionArray[9] = box.min.x;
        boxPositionArray[10] = box.max.y;
        boxPositionArray[11] = box.max.z;
        boxPositionArray[12] = box.min.x;
        boxPositionArray[13] = box.min.y;
        boxPositionArray[14] = box.min.z;
        boxPositionArray[15] = box.max.x;
        boxPositionArray[16] = box.min.y;
        boxPositionArray[17] = box.min.z;
        boxPositionArray[18] = box.max.x;
        boxPositionArray[19] = box.max.y;
        boxPositionArray[20] = box.min.z;
        boxPositionArray[21] = box.min.x;
        boxPositionArray[22] = box.max.y;
        boxPositionArray[23] = box.min.z;
        const boxPosition = new Float32BufferAttribute(boxPositionArray, 3).applyMatrix4(mesh.matrix).array;
        return boxPosition;
    }
}

class PickingScene {
    constructor() {
        this._lastPickingColor = 0;
        this._materials = [];
        this._releasedMaterials = [];
        this._pickingMeshById = new Map();
        this._sourceMeshByPickingColor = new Map();
        const target = new WebGLRenderTarget(1, 1);
        const scene = new Scene();
        scene.background = new Color(0);
        this._scene = scene;
        this._target = target;
    }
    destroy() {
        this._materials.forEach(x => x.dispose());
        this._materials = null;
        this._target.dispose();
        this._target = null;
    }
    add(sourceMesh) {
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
    remove(sourceMesh) {
        const pickingMesh = this._pickingMeshById.get(sourceMesh.uuid);
        if (pickingMesh) {
            this._scene.remove(pickingMesh);
            this._pickingMeshById.delete(sourceMesh.uuid);
            this._sourceMeshByPickingColor.delete(pickingMesh.userData.color);
            this.releaseMaterial(pickingMesh.material);
        }
    }
    getSourceMeshAt(camera, renderer, clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = (clientX - rect.left) * renderer.domElement.width / rect.width;
        const y = (clientY - rect.top) * renderer.domElement.height / rect.height;
        const pixelRatio = renderer.getPixelRatio();
        camera.setViewOffset(renderer.getContext().drawingBufferWidth, renderer.getContext().drawingBufferHeight, x * pixelRatio || 0, y * pixelRatio || 0, 1, 1);
        renderer.setRenderTarget(this._target);
        renderer.render(this._scene, camera);
        renderer.setRenderTarget(null);
        camera.clearViewOffset();
        const pixelBuffer = new Uint8Array(4);
        renderer.readRenderTargetPixels(this._target, 0, 0, 1, 1, pixelBuffer);
        const hex = ((pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2])).toString(16);
        const mesh = this._sourceMeshByPickingColor.get(hex);
        return mesh;
    }
    nextPickingColor() {
        if (this._lastPickingColor === 16777215) {
            this._lastPickingColor = 0;
        }
        return ++this._lastPickingColor;
    }
    getMaterial() {
        if (this._releasedMaterials.length) {
            return this._releasedMaterials.pop();
        }
        const color = new Color(this.nextPickingColor());
        const material = new MeshBasicMaterial({
            color: color,
            flatShading: true,
            blending: NoBlending,
            side: DoubleSide,
        });
        this._materials.push(material);
        return material;
    }
    releaseMaterial(material) {
        this._releasedMaterials.push(material);
    }
}

class CameraControls {
    constructor(rendererCanvas, changeCallback) {
        const camera = new PerspectiveCamera(75, 1, 1, 10000);
        const orbitControls = new OrbitControls(camera, rendererCanvas);
        orbitControls.addEventListener("change", changeCallback);
        camera.position.set(0, 1000, 1000);
        camera.lookAt(0, 0, 0);
        orbitControls.update();
        this._changeCallback = changeCallback;
        this._camera = camera;
        this._orbitControls = orbitControls;
    }
    get camera() {
        return this._camera;
    }
    changeCanvas(rendererCanvas) {
        this._orbitControls.dispose();
        this._orbitControls = new OrbitControls(this.camera, rendererCanvas);
        this._orbitControls.addEventListener("change", this._changeCallback);
        if (this._lastFocusBox) {
            this.focusCameraOnBox(this._lastFocusBox);
        }
    }
    destroy() {
        this._orbitControls.dispose();
    }
    resize(width, height) {
        if (this._camera) {
            this._camera.aspect = width / height;
            this._camera.updateProjectionMatrix();
        }
    }
    focusCameraOnObjects(objects, offset = 1.2) {
        if (!(objects === null || objects === void 0 ? void 0 : objects.length)) {
            return;
        }
        const box = new Box3();
        for (const object of objects) {
            box.expandByObject(object);
        }
        this._lastFocusBox = box;
        this.focusCameraOnBox(box);
    }
    focusCameraOnBox(box) {
        const offset = 1.2;
        const size = box.getSize(new Vector3());
        const center = box.getCenter(new Vector3());
        const maxSize = Math.max(size.x, size.y, size.z);
        const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * this._camera.fov / 360));
        const fitWidthDistance = fitHeightDistance / this._camera.aspect;
        const distance = offset * Math.max(fitHeightDistance, fitWidthDistance);
        const direction = this._orbitControls.target.clone()
            .sub(this._camera.position)
            .normalize()
            .multiplyScalar(distance);
        this._orbitControls.maxDistance = Math.max(distance * 10, 10000);
        this._orbitControls.target.copy(center);
        this._camera.near = Math.min(distance / 100, 1);
        this._camera.far = Math.max(distance * 100, 10000);
        this._camera.updateProjectionMatrix();
        this._camera.position.copy(this._orbitControls.target).sub(direction);
        this._orbitControls.update();
    }
}

class Lights {
    constructor(physicalLights, ambientLightIntensity, hemiLightIntensity, dirLightIntensity) {
        const ambientLight = new AmbientLight(0x222222, physicalLights
            ? ambientLightIntensity * Math.PI
            : ambientLightIntensity);
        this._ambientLight = ambientLight;
        const hemiLight = new HemisphereLight(0xffffbb, 0x080820, physicalLights
            ? hemiLightIntensity * Math.PI
            : hemiLightIntensity);
        hemiLight.position.set(0, 2000, 0);
        this._hemisphereLight = hemiLight;
        const dirLight = new DirectionalLight(0xffffff, physicalLights
            ? dirLightIntensity * Math.PI
            : dirLightIntensity);
        dirLight.position.set(-2, 10, 2);
        this._directionalLight = dirLight;
    }
    update(physicalLights, ambientLightIntensity, hemiLightIntensity, dirLightIntensity) {
        this._ambientLight.intensity = physicalLights
            ? ambientLightIntensity * Math.PI
            : ambientLightIntensity;
        this._hemisphereLight.intensity = physicalLights
            ? hemiLightIntensity * Math.PI
            : hemiLightIntensity;
        this._directionalLight.intensity = physicalLights
            ? dirLightIntensity * Math.PI
            : dirLightIntensity;
    }
    getLights() {
        return [
            this._ambientLight,
            this._hemisphereLight,
            this._directionalLight,
        ];
    }
    getCopy() {
        return [
            new AmbientLight().copy(this._ambientLight),
            new HemisphereLight().copy(this._hemisphereLight),
            new DirectionalLight().copy(this._directionalLight),
        ];
    }
}

class GltfViewerOptions {
    constructor(item = null) {
        this.useAntialiasing = false;
        this.usePhysicalLights = false;
        this.ambientLightIntensity = 1;
        this.hemiLightIntensity = 0.4;
        this.dirLightIntensity = 0.6;
        this.highlightingEnabled = true;
        this.highlightColor = 0xFFFF00;
        this.selectionColor = 0xFF0000;
        this.isolationColor = 0x555555;
        this.isolationOpacity = 0.2;
        this.meshMergeType = null;
        this.fastRenderType = null;
        if (item != null) {
            Object.assign(this, item);
        }
    }
}

var __awaiter$2 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class GltfViewer {
    constructor(containerId, dracoDecoderPath, options) {
        this._optionsChange = new BehaviorSubject(null);
        this._loadingStateChange = new BehaviorSubject(false);
        this._modelLoadingStart = new Subject();
        this._modelLoadingEnd = new Subject();
        this._modelLoadingProgress = new Subject();
        this._openedModelsChange = new BehaviorSubject([]);
        this._selectionChange = new BehaviorSubject(new Set());
        this._manualSelectionChange = new Subject();
        this._lastFrameTime = new BehaviorSubject(0);
        this._subscriptions = [];
        this._meshesNeedColorUpdate = new Set();
        this._pointerEventHelper = PointerEventHelper.default;
        this._queuedColoring = null;
        this._queuedSelection = null;
        this._highlightedMesh = null;
        this._selectedMeshes = [];
        this._isolatedMeshes = [];
        this._coloredMeshes = [];
        this._loadingInProgress = false;
        this._loadingQueue = [];
        this._loadedModels = new Set();
        this._loadedModelsByGuid = new Map();
        this._loadedModelsArray = [];
        this._loadedMeshes = new Set();
        this._loadedMeshesById = new Map();
        this._loadedMeshesArray = [];
        this.onCanvasPointerDown = (e) => {
            this._pointerEventHelper.downX = e.clientX;
            this._pointerEventHelper.downY = e.clientY;
        };
        this.onCanvasPointerUp = (e) => {
            const x = e.clientX;
            const y = e.clientY;
            if (!this._pointerEventHelper.downX
                || Math.abs(x - this._pointerEventHelper.downX) > this._pointerEventHelper.maxDiff
                || Math.abs(y - this._pointerEventHelper.downY) > this._pointerEventHelper.maxDiff) {
                return;
            }
            if (this._pointerEventHelper.waitForDouble) {
                this.isolateSelectedMeshes();
                this._pointerEventHelper.waitForDouble = false;
            }
            else {
                this._pointerEventHelper.waitForDouble = true;
                setTimeout(() => {
                    this._pointerEventHelper.waitForDouble = false;
                }, 300);
                this.selectMeshAtPoint(x, y, e.ctrlKey);
            }
            this._pointerEventHelper.downX = null;
            this._pointerEventHelper.downY = null;
        };
        this.onCanvasMouseMove = (e) => {
            if (e.buttons) {
                return;
            }
            clearTimeout(this._pointerEventHelper.mouseMoveTimer);
            this._pointerEventHelper.mouseMoveTimer = null;
            this._pointerEventHelper.mouseMoveTimer = window.setTimeout(() => {
                const x = e.clientX;
                const y = e.clientY;
                this.highlightMeshAtPoint(x, y);
            }, 30);
        };
        this.initObservables();
        this._container = document.getElementById(containerId);
        if (!this._container) {
            throw new Error("Container not found!");
        }
        this._options = new GltfViewerOptions(options);
        this._optionsChange.next(this._options);
        this._colorRgbRmoUtils = new ColorRgbRmoUtils(this._options.isolationColor, this._options.isolationOpacity, this._options.selectionColor, this._options.highlightColor);
        this._lights = new Lights(this._options.usePhysicalLights, this._options.ambientLightIntensity, this._options.hemiLightIntensity, this._options.dirLightIntensity);
        this._renderScene = new RenderScene(this._colorRgbRmoUtils);
        this._simplifiedScene = new SimplifiedScene(this._colorRgbRmoUtils);
        this._pickingScene = new PickingScene();
        this.initLoader(dracoDecoderPath);
        this.initRenderer();
        this._containerResizeSensor = new ResizeSensor(this._container, () => {
            this.resizeRenderer();
        });
    }
    destroy() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        this._subscriptions.forEach(x => x.unsubscribe());
        this.closeSubjects();
        (_a = this._containerResizeSensor) === null || _a === void 0 ? void 0 : _a.detach();
        this._containerResizeSensor = null;
        (_b = this._cameraControls) === null || _b === void 0 ? void 0 : _b.destroy();
        this._cameraControls = null;
        (_c = this._renderer) === null || _c === void 0 ? void 0 : _c.dispose();
        (_e = (_d = this._loader) === null || _d === void 0 ? void 0 : _d.dracoLoader) === null || _e === void 0 ? void 0 : _e.dispose();
        (_f = this._pickingScene) === null || _f === void 0 ? void 0 : _f.destroy();
        this._pickingScene = null;
        (_g = this._simplifiedScene) === null || _g === void 0 ? void 0 : _g.destroy();
        this._simplifiedScene = null;
        (_h = this._renderScene) === null || _h === void 0 ? void 0 : _h.destroy();
        this._renderScene = null;
        (_j = this._colorRgbRmoUtils) === null || _j === void 0 ? void 0 : _j.destroy();
        this._colorRgbRmoUtils = null;
        (_k = this._loadedMeshes) === null || _k === void 0 ? void 0 : _k.forEach(x => {
            x.geometry.dispose();
            x.material.dispose();
        });
        this._loadedMeshes = null;
    }
    updateOptionsAsync(options) {
        return __awaiter$2(this, void 0, void 0, function* () {
            const oldOptions = this._options;
            this._options = new GltfViewerOptions(options);
            let rendererReinitialized = false;
            let lightsReinitialized = false;
            let colorsUpdated = false;
            if (this._options.useAntialiasing !== oldOptions.useAntialiasing) {
                this.initRenderer();
                rendererReinitialized = true;
            }
            if (this._options.usePhysicalLights !== oldOptions.usePhysicalLights
                || this._options.ambientLightIntensity !== oldOptions.ambientLightIntensity
                || this._options.hemiLightIntensity !== oldOptions.hemiLightIntensity
                || this._options.dirLightIntensity !== oldOptions.dirLightIntensity) {
                this._renderer.physicallyCorrectLights = this._options.usePhysicalLights;
                this._lights.update(this._options.usePhysicalLights, this._options.ambientLightIntensity, this._options.hemiLightIntensity, this._options.dirLightIntensity);
                lightsReinitialized = true;
            }
            if (this._options.isolationColor !== oldOptions.isolationColor
                || this._options.isolationOpacity !== oldOptions.isolationOpacity
                || this._options.selectionColor !== oldOptions.selectionColor
                || this._options.highlightColor !== oldOptions.highlightColor) {
                this._colorRgbRmoUtils.updateColors(this._options.isolationColor, this._options.isolationOpacity, this._options.selectionColor, this._options.highlightColor);
                colorsUpdated = true;
            }
            if (rendererReinitialized || lightsReinitialized || colorsUpdated) {
                this._colorRgbRmoUtils.updateMaterials();
            }
            if (this._options.highlightingEnabled !== oldOptions.highlightingEnabled) {
                if (this._options.highlightingEnabled) {
                    this._renderer.domElement.addEventListener("mousemove", this.onCanvasMouseMove);
                }
                else {
                    this._renderer.domElement.removeEventListener("mousemove", this.onCanvasMouseMove);
                }
            }
            if (this._options.meshMergeType !== oldOptions.meshMergeType
                || this._options.fastRenderType !== oldOptions.fastRenderType) {
                yield this.updateRenderSceneAsync();
            }
            this._optionsChange.next(this._options);
            return this._options;
        });
    }
    openModelsAsync(modelInfos) {
        return __awaiter$2(this, void 0, void 0, function* () {
            if (!(modelInfos === null || modelInfos === void 0 ? void 0 : modelInfos.length)) {
                return [];
            }
            const promises = [];
            modelInfos.forEach(x => {
                const resultSubject = new AsyncSubject();
                this._loadingQueue.push(() => __awaiter$2(this, void 0, void 0, function* () {
                    const { url, guid, name } = x;
                    const result = !this._loadedModelsByGuid.has(guid)
                        ? yield this.loadModel(url, guid, name)
                        : { url, guid };
                    resultSubject.next(result);
                    resultSubject.complete();
                }));
                promises.push(resultSubject.pipe(first()).toPromise());
            });
            this.processLoadingQueueAsync();
            const overallResult = yield Promise.all(promises);
            return overallResult;
        });
    }
    ;
    closeModelsAsync(modelGuids) {
        return __awaiter$2(this, void 0, void 0, function* () {
            if (!(modelGuids === null || modelGuids === void 0 ? void 0 : modelGuids.length)) {
                return;
            }
            const promises = [];
            modelGuids.forEach(x => {
                const resultSubject = new AsyncSubject();
                this._loadingQueue.push(() => __awaiter$2(this, void 0, void 0, function* () {
                    this.removeModelFromLoaded(x);
                    resultSubject.next(true);
                    resultSubject.complete();
                }));
                promises.push(resultSubject.pipe(first()).toPromise());
            });
            this.processLoadingQueueAsync();
            yield Promise.all(promises);
        });
    }
    ;
    colorItems(coloringInfos) {
        if (this._loadingInProgress) {
            this._queuedColoring = coloringInfos;
            return;
        }
        this.resetSelectionAndColorMeshes(coloringInfos);
    }
    selectItems(ids) {
        if (!(ids === null || ids === void 0 ? void 0 : ids.length)) {
            return;
        }
        if (this._loadingInProgress) {
            this._queuedSelection = { ids, isolate: false };
            return;
        }
        this.findAndSelectMeshes(ids, false);
    }
    ;
    isolateItems(ids) {
        if (!(ids === null || ids === void 0 ? void 0 : ids.length)) {
            return;
        }
        if (this._loadingInProgress) {
            this._queuedSelection = { ids, isolate: true };
            return;
        }
        this.findAndSelectMeshes(ids, true);
    }
    ;
    getOpenedModels() {
        return this._openedModelsChange.getValue();
    }
    getSelectedItems() {
        return this._selectionChange.getValue();
    }
    initObservables() {
        this.optionsChange$ = this._optionsChange.asObservable();
        this.loadingStateChange$ = this._loadingStateChange.asObservable();
        this.modelLoadingStart$ = this._modelLoadingStart.asObservable();
        this.modelLoadingProgress$ = this._modelLoadingProgress.asObservable();
        this.modelLoadingEnd$ = this._modelLoadingEnd.asObservable();
        this.openedModelsChange$ = this._openedModelsChange.asObservable();
        this.selectionChange$ = this._selectionChange.asObservable();
        this.manualSelectionChange$ = this._manualSelectionChange.asObservable();
        this.lastFrameTime$ = this._lastFrameTime.asObservable();
    }
    closeSubjects() {
        this._optionsChange.complete();
        this._loadingStateChange.complete();
        this._modelLoadingStart.complete();
        this._modelLoadingProgress.complete();
        this._modelLoadingEnd.complete();
        this._openedModelsChange.complete();
        this._selectionChange.complete();
        this._manualSelectionChange.complete();
        this._lastFrameTime.complete();
    }
    addCanvasEventListeners() {
        const { highlightingEnabled } = this._options;
        this._renderer.domElement.addEventListener("pointerdown", this.onCanvasPointerDown);
        this._renderer.domElement.addEventListener("pointerup", this.onCanvasPointerUp);
        if (highlightingEnabled) {
            this._renderer.domElement.addEventListener("mousemove", this.onCanvasMouseMove);
        }
    }
    initRenderer() {
        if (this._renderer) {
            this._renderer.domElement.remove();
            this._renderer.dispose();
            this._renderer.forceContextLoss();
            this._renderer = null;
        }
        const { useAntialiasing, usePhysicalLights } = this._options;
        const renderer = new WebGLRenderer({
            alpha: true,
            antialias: useAntialiasing,
        });
        renderer.setClearColor(0x000000, 0);
        renderer.outputEncoding = sRGBEncoding;
        renderer.toneMapping = NoToneMapping;
        renderer.physicallyCorrectLights = usePhysicalLights;
        this._renderer = renderer;
        this.resizeRenderer();
        this.addCanvasEventListeners();
        if (this._cameraControls) {
            this._cameraControls.changeCanvas(this._renderer.domElement);
        }
        else {
            this._cameraControls = new CameraControls(this._renderer.domElement, () => this.renderOnCameraMove());
        }
        this._container.append(this._renderer.domElement);
    }
    resizeRenderer() {
        var _a, _b;
        const { width, height } = this._container.getBoundingClientRect();
        (_a = this._cameraControls) === null || _a === void 0 ? void 0 : _a.resize(width, height);
        (_b = this._renderer) === null || _b === void 0 ? void 0 : _b.setSize(width, height, false);
        this.render();
    }
    updateRenderSceneAsync() {
        return __awaiter$2(this, void 0, void 0, function* () {
            yield this._renderScene.updateSceneAsync(this._lights.getLights(), this._loadedMeshesArray, this._loadedModelsArray, this._options.meshMergeType);
            if (this._options.fastRenderType) {
                yield this._simplifiedScene.updateSceneAsync(this._lights.getCopy(), this._loadedMeshesArray, this._options.fastRenderType);
            }
            else {
                this._simplifiedScene.clearScene();
            }
            this.render(this._loadedMeshesArray.length ? [this._renderScene.scene] : null);
        });
    }
    prepareToRender(focusObjects = null) {
        if (focusObjects === null || focusObjects === void 0 ? void 0 : focusObjects.length) {
            this._cameraControls.focusCameraOnObjects(focusObjects);
        }
        if (this._meshesNeedColorUpdate.size) {
            this._renderScene.updateMeshColors(this._meshesNeedColorUpdate);
            this._meshesNeedColorUpdate.clear();
        }
    }
    render(focusObjects = null, fast = false) {
        this.prepareToRender(focusObjects);
        requestAnimationFrame(() => {
            var _a, _b;
            if (!this._renderer) {
                return;
            }
            const start = performance.now();
            if (fast && ((_a = this._simplifiedScene) === null || _a === void 0 ? void 0 : _a.scene)) {
                this._renderer.render(this._simplifiedScene.scene, this._cameraControls.camera);
            }
            else if ((_b = this._renderScene) === null || _b === void 0 ? void 0 : _b.scene) {
                this._renderer.render(this._renderScene.scene, this._cameraControls.camera);
            }
            const frameTime = performance.now() - start;
            this._lastFrameTime.next(frameTime);
            console.log(frameTime);
        });
    }
    renderOnCameraMove() {
        if (this._options.fastRenderType) {
            if (this._deferRender) {
                clearTimeout(this._deferRender);
                this._deferRender = null;
            }
            this.render(null, true);
            this._deferRender = window.setTimeout(() => {
                this._deferRender = null;
                this.render();
            }, 300);
        }
        else {
            this.render();
        }
    }
    initLoader(dracoDecoderPath) {
        const loader = new GLTFLoader();
        if (dracoDecoderPath) {
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath(dracoDecoderPath);
            dracoLoader.preload();
            loader.setDRACOLoader(dracoLoader);
        }
        this._loader = loader;
    }
    processLoadingQueueAsync() {
        return __awaiter$2(this, void 0, void 0, function* () {
            if (!this._loader
                || this._loadingInProgress
                || !this._loadingQueue.length) {
                return;
            }
            this._loadingInProgress = true;
            this._loadingStateChange.next(true);
            while (this._loadingQueue.length > 0) {
                const action = this._loadingQueue.shift();
                yield action();
            }
            this.updateModelsDataArrays();
            this.runQueuedColoring();
            this.runQueuedSelection();
            yield this.updateRenderSceneAsync();
            this.emitOpenedModelsChanged();
            this._loadingStateChange.next(false);
            this._loadingInProgress = false;
            yield this.processLoadingQueueAsync();
        });
    }
    loadModel(url, guid, name) {
        return __awaiter$2(this, void 0, void 0, function* () {
            this.onModelLoadingStart(url, guid);
            let error;
            try {
                const model = yield this._loader.loadAsync(url, (progress) => this.onModelLoadingProgress(progress, url, guid));
                this.addModelToLoaded(model, guid, name);
            }
            catch (loadingError) {
                error = loadingError;
            }
            const result = { url, guid, error };
            this.onModelLoadingEnd(result);
            return result;
        });
    }
    onModelLoadingStart(url, guid) {
        this._modelLoadingStart.next({ url, guid });
    }
    onModelLoadingProgress(progress, url, guid) {
        const currentProgress = Math.round(progress.loaded / progress.total * 100);
        this._modelLoadingProgress.next({ url, guid, progress: currentProgress });
    }
    onModelLoadingEnd(info) {
        const { url, guid } = info;
        this._modelLoadingProgress.next({ url, guid, progress: 0 });
        this._modelLoadingEnd.next(info);
    }
    addModelToLoaded(gltf, modelGuid, modelName) {
        const name = modelName || modelGuid;
        const scene = gltf.scene;
        scene.userData.guid = modelGuid;
        scene.name = name;
        const meshes = [];
        const handles = new Set();
        scene.traverse(x => {
            if (x instanceof Mesh
                && x.geometry instanceof BufferGeometry
                && x.material instanceof MeshStandardMaterial) {
                const id = `${modelGuid}|${x.name}`;
                x.userData.id = id;
                x.userData.modelGuid = modelGuid;
                this._pickingScene.add(x);
                this._loadedMeshes.add(x);
                if (this._loadedMeshesById.has(id)) {
                    this._loadedMeshesById.get(id).push(x);
                }
                else {
                    this._loadedMeshesById.set(id, [x]);
                }
                meshes.push(x);
                handles.add(x.name);
            }
        });
        const modelInfo = { name, meshes, handles };
        this._loadedModels.add(modelInfo);
        this._loadedModelsByGuid.set(modelGuid, modelInfo);
    }
    removeModelFromLoaded(modelGuid) {
        if (!this._loadedModelsByGuid.has(modelGuid)) {
            return;
        }
        const modelData = this._loadedModelsByGuid.get(modelGuid);
        modelData.meshes.forEach(x => {
            var _a;
            this._loadedMeshes.delete(x);
            this._loadedMeshesById.delete(x.userData.id);
            this._pickingScene.remove(x);
            (_a = x.geometry) === null || _a === void 0 ? void 0 : _a.dispose();
        });
        this._highlightedMesh = null;
        this._selectedMeshes = this._selectedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
        this._isolatedMeshes = this._isolatedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
        this._coloredMeshes = this._coloredMeshes.filter(x => x.userData.modelGuid !== modelGuid);
        this._loadedModels.delete(modelData);
        this._loadedModelsByGuid.delete(modelGuid);
    }
    updateModelsDataArrays() {
        this._loadedMeshesArray = [...this._loadedMeshes];
        this._loadedModelsArray = [...this._loadedModels];
    }
    emitOpenedModelsChanged() {
        const modelOpenedInfos = [];
        for (const [modelGuid, model] of this._loadedModelsByGuid) {
            modelOpenedInfos.push({ guid: modelGuid, name: model.name, handles: model.handles });
        }
        this._openedModelsChange.next(modelOpenedInfos);
    }
    runQueuedColoring() {
        if (this._queuedColoring) {
            this.resetSelectionAndColorMeshes(this._queuedColoring);
        }
    }
    resetSelectionAndColorMeshes(coloringInfos) {
        this.removeIsolation();
        this.removeSelection();
        this.colorMeshes(coloringInfos);
    }
    colorMeshes(coloringInfos) {
        this.removeColoring();
        if (coloringInfos === null || coloringInfos === void 0 ? void 0 : coloringInfos.length) {
            for (const info of coloringInfos) {
                const color = new Color(info.color);
                const customColor = new ColorRgbRmo(color.r, color.g, color.b, 1, 0, info.opacity);
                info.ids.forEach(x => {
                    const meshes = this._loadedMeshesById.get(x);
                    if (meshes === null || meshes === void 0 ? void 0 : meshes.length) {
                        meshes.forEach(mesh => {
                            mesh.userData.colored = true;
                            ColorRgbRmo.setCustomToMesh(mesh, customColor);
                            this._meshesNeedColorUpdate.add(mesh);
                            this._coloredMeshes.push(mesh);
                        });
                    }
                });
            }
        }
        this.render();
    }
    removeColoring() {
        for (const mesh of this._coloredMeshes) {
            mesh.userData.colored = undefined;
            ColorRgbRmo.deleteFromMesh(mesh, true);
            this._meshesNeedColorUpdate.add(mesh);
        }
        this._coloredMeshes.length = 0;
    }
    getMeshAt(clientX, clientY) {
        return this._renderer && this._pickingScene
            ? this._pickingScene.getSourceMeshAt(this._cameraControls.camera, this._renderer, clientX, clientY)
            : null;
    }
    runQueuedSelection() {
        if (this._queuedSelection) {
            const { ids, isolate } = this._queuedSelection;
            this.findAndSelectMeshes(ids, isolate);
        }
    }
    findAndSelectMeshes(ids, isolate) {
        const { found } = this.findMeshesByIds(new Set(ids));
        if (found.length) {
            this.selectMeshes(found, false, isolate);
        }
    }
    findMeshesByIds(ids) {
        const found = [];
        const notFound = new Set();
        ids.forEach(x => {
            if (this._loadedMeshesById.has(x)) {
                found.push(...this._loadedMeshesById.get(x));
            }
            else {
                notFound.add(x);
            }
        });
        return { found, notFound };
    }
    removeSelection() {
        for (const mesh of this._selectedMeshes) {
            mesh.userData.selected = undefined;
            this._meshesNeedColorUpdate.add(mesh);
        }
        this._selectedMeshes.length = 0;
    }
    removeIsolation() {
        for (const mesh of this._isolatedMeshes) {
            mesh.userData.isolated = undefined;
            this._meshesNeedColorUpdate.add(mesh);
        }
        this._isolatedMeshes.length = 0;
    }
    selectMeshAtPoint(x, y, keepPreviousSelection) {
        const mesh = this.getMeshAt(x, y);
        if (!mesh) {
            this.selectMeshes([], true, false);
            return;
        }
        if (keepPreviousSelection) {
            if (mesh.userData.selected) {
                this.removeFromSelection(mesh);
            }
            else {
                this.addToSelection(mesh);
            }
        }
        else {
            this.selectMeshes([mesh], true, false);
        }
    }
    addToSelection(mesh) {
        const meshes = [mesh, ...this._selectedMeshes];
        this.selectMeshes(meshes, true, false);
        return true;
    }
    removeFromSelection(mesh) {
        const meshes = this._selectedMeshes.filter(x => x !== mesh);
        this.selectMeshes(meshes, true, false);
        return true;
    }
    selectMeshes(meshes, manual, isolateSelected) {
        this.removeSelection();
        this.removeIsolation();
        if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
            this.emitSelectionChanged(manual, true);
            return null;
        }
        meshes.forEach(x => {
            x.userData.selected = true;
            this._meshesNeedColorUpdate.add(x);
        });
        this._selectedMeshes = meshes;
        if (isolateSelected) {
            this.emitSelectionChanged(manual, false);
            this.isolateSelectedMeshes();
        }
        else {
            this.emitSelectionChanged(manual, true);
        }
    }
    isolateSelectedMeshes() {
        if (!this._selectedMeshes.length) {
            return;
        }
        this._loadedMeshesArray.forEach(x => {
            if (!x.userData.selected) {
                x.userData.isolated = true;
                this._meshesNeedColorUpdate.add(x);
                this._isolatedMeshes.push(x);
            }
        });
        this.render(this._selectedMeshes);
    }
    emitSelectionChanged(manual, render) {
        if (render) {
            this.render(manual ? null : this._selectedMeshes);
        }
        const ids = new Set();
        this._selectedMeshes.forEach(x => ids.add(x.userData.id));
        this._selectionChange.next(ids);
        if (manual) {
            this._manualSelectionChange.next(ids);
        }
    }
    highlightMeshAtPoint(x, y) {
        const mesh = this.getMeshAt(x, y);
        this.highlightItem(mesh);
    }
    highlightItem(mesh) {
        if (mesh === this._highlightedMesh) {
            return;
        }
        this.removeHighlighting();
        if (mesh) {
            mesh.userData.highlighted = true;
            this._meshesNeedColorUpdate.add(mesh);
            this._highlightedMesh = mesh;
        }
        this.render();
    }
    removeHighlighting() {
        if (this._highlightedMesh) {
            const mesh = this._highlightedMesh;
            mesh.userData.highlighted = undefined;
            this._meshesNeedColorUpdate.add(mesh);
            this._highlightedMesh = null;
        }
    }
}

export { GltfViewer, GltfViewerOptions };
