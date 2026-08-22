'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { OpenCadMesh } from '@/lib/opencad-adapter';

export function OpenCadMeshViewport({ mesh }: { mesh: OpenCadMesh | null }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element || !mesh) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#08101b');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
    camera.up.set(0, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3));
    geometry.setIndex(mesh.faces);
    if (mesh.normals.length === mesh.vertices.length && mesh.normals.some((value) => Math.abs(value) > 0.000001)) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
    else geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.center();

    const material = new THREE.MeshStandardMaterial({ color: '#8ea4b8', metalness: 0.16, roughness: 0.64, flatShading: true });
    const body = new THREE.Mesh(geometry, material);
    scene.add(body);
    const edgeGeometry = new THREE.EdgesGeometry(geometry, 18);
    const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: '#b8ff65', transparent: true, opacity: 0.68 }));
    scene.add(edges);

    scene.add(new THREE.HemisphereLight('#d5ecff', '#17202b', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(70, -55, 100);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#5ce5d7', 1.2);
    rim.position.set(-60, 40, 30);
    scene.add(rim);

    const grid = new THREE.GridHelper(180, 18, '#30435c', '#182638');
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -(geometry.boundingBox?.getSize(new THREE.Vector3()).z ?? 80) / 2 - 1;
    scene.add(grid);

    const size = geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(50, 30, 100);
    const radius = Math.max(size.x, size.y, size.z);
    camera.position.set(radius * 1.15, -radius * 1.35, radius * .9);
    camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 0, 0);

    let frame = 0;
    const draw = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(draw);
    };
    const resize = () => {
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    draw();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      edgeGeometry.dispose();
      material.dispose();
      (edges.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [mesh]);

  return <div className="opencad-three-host" ref={host}>{!mesh && <div className="opencad-no-geometry"><i /><b>No geometry loaded</b><span>Connect the local OpenCAD OCCT service or load the clearly marked simulated preview.</span></div>}</div>;
}
