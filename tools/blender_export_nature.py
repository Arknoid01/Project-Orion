#!/usr/bin/env python3
"""
Génère 5 arbres + 3 buissons méditerranéens (low-poly procédural) et les rend en PNG transparents.

Usage (automatique — voir run_blender_nature.py) :
  blender --background --python tools/blender_export_nature.py

Sortie brute : assets/generated_nature/raw/
Post-traitement (PIL) : assets/generated_nature/
"""

from __future__ import annotations

import math
import os
import sys

try:
    import bpy
    from mathutils import Vector
except ImportError:
    print(
        "Ce script doit tourner DANS Blender, pas avec python.exe.\n"
        "Lance plutôt :  python tools/run_blender_nature.py"
    )
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_RAW = os.path.join(ROOT, "assets", "generated_nature", "raw")
RENDER_SIZE = 512

# Même angle que js/threeRenderer.js (ISO_H = π/4, ISO_V = atan(1/√2))
ISO_H = math.pi / 4
ISO_V = math.atan(1 / math.sqrt(2))
CAM_DIST = 14.0


def _ensure_out():
    os.makedirs(OUT_RAW, exist_ok=True)


def _clear_scene():
    """Supprime les meshes de la passe en cours, garde caméra + lumières."""
    for obj in list(bpy.data.objects):
        if obj.type in ("CAMERA", "LIGHT"):
            continue
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)


def _mat(name: str, rgb: tuple[float, float, float], shade: float = 1.0):
    """Matériau unlit (Emission) — couleur plate, pas de facettes qui tournent avec la lumière."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    tree = mat.node_tree
    nodes = tree.nodes
    links = tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    r, g, b = rgb
    # Légère variation tonale pour garder du volume sans textures directionnelles
    emit.inputs["Color"].default_value = (
        min(1.0, r * shade),
        min(1.0, g * shade),
        min(1.0, b * shade),
        1.0,
    )
    emit.inputs["Strength"].default_value = 1.0
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def _assign_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def _cyl(name, r, height, z_center, mat, dx=0.0, dy=0.0):
    """Cylindre vertical — z_center = hauteur du centre (Blender Z-up)."""
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=height,
                                         location=(dx, dy, z_center), vertices=14)
    obj = bpy.context.active_object
    obj.name = name
    _assign_mat(obj, mat)
    return obj


def _sphere(name, r, x, y, z, mat, sx=1.0, sy=1.0, sz=1.0):
    """Sphère — x,y = position horizontale, z = hauteur (Blender Z-up)."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, y, z),
                                          segments=24, ring_count=16)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (sx, sy, sz)
    _assign_mat(obj, mat)
    return obj


def _cone(name, r1, r2, height, z_base, mat, dx=0.0, dy=0.0):
    """Cône vertical — z_base = bas du cône, centre à z_base + height/2."""
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=height,
                                     location=(dx, dy, z_base + height / 2), vertices=16)
    obj = bpy.context.active_object
    obj.name = name
    _assign_mat(obj, mat)
    return obj


def _join(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    try:
        if hasattr(obj.data, "use_auto_smooth"):
            obj.data.use_auto_smooth = True
            obj.data.auto_smooth_angle = math.radians(55)
    except AttributeError:
        pass
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def build_olive():
    """Olivier — tronc + couronne arrondie. Blender Z=haut."""
    trunk = _mat("trunk", (0.48, 0.32, 0.18))
    leaf  = _mat("leaf",  (0.34, 0.58, 0.26))
    parts = []
    # tronc : hauteur 0.55, centre à z=0.275
    parts.append(_cyl("trunk", 0.12, 0.55, 0.275, trunk))
    # couronnes : base à z=0.55, légèrement décalées en x/y
    for i, (dx, dy, s) in enumerate([
        ( 0.00,  0.00, 0.48),
        (-0.18,  0.08, 0.38),
        ( 0.16, -0.06, 0.36),
        ( 0.04,  0.14, 0.32),
    ]):
        parts.append(_sphere(f"c{i}", 0.30, dx, dy, 0.68 + i * 0.05, leaf, sx=s, sy=s, sz=0.75 * s))
    return _join(parts)


def build_cypress():
    """Cyprès — fût vertical."""
    trunk = _mat("trunk", (0.36, 0.24, 0.14))
    leaf  = _mat("leaf",  (0.18, 0.44, 0.22))
    parts = []
    parts.append(_cyl("trunk", 0.08, 0.30, 0.15, trunk))
    # cône de 1.4 de haut, base à z=0.30
    parts.append(_cone("top", 0.45, 0.02, 1.40, 0.30, leaf))
    return _join(parts)


def build_pine():
    """Pin — 3 étages coniques."""
    trunk = _mat("trunk", (0.40, 0.26, 0.15))
    leaf  = _mat("leaf",  (0.14, 0.38, 0.20))
    parts = []
    parts.append(_cyl("trunk", 0.09, 0.45, 0.225, trunk))
    # étages : (r_base, hauteur, z_base)
    for i, (rb, h, zb) in enumerate([(0.58, 0.42, 0.38), (0.44, 0.38, 0.65), (0.28, 0.34, 0.88)]):
        parts.append(_cone(f"t{i}", rb, 0.04, h, zb, leaf))
    return _join(parts)


def build_umbrella_pine():
    """Pin parasol — tronc haut + plateau plat."""
    trunk = _mat("trunk", (0.44, 0.30, 0.17))
    leaf  = _mat("leaf",  (0.22, 0.48, 0.24))
    parts = []
    parts.append(_cyl("trunk", 0.09, 0.80, 0.40, trunk))
    # sphère aplatie en Z = plateau
    parts.append(_sphere("canopy", 0.62, 0.0, 0.0, 0.96, leaf, sx=1.0, sy=1.0, sz=0.30))
    return _join(parts)


def build_fig():
    """Figuier — tronc épais, large boule."""
    trunk = _mat("trunk", (0.48, 0.32, 0.18))
    leaf  = _mat("leaf",  (0.32, 0.62, 0.30))
    parts = []
    parts.append(_cyl("trunk", 0.15, 0.50, 0.25, trunk))
    parts.append(_sphere("c1", 0.55, 0.00, 0.00, 0.84, leaf, sx=1.0, sy=1.0, sz=0.90))
    parts.append(_sphere("c2", 0.35, 0.24, 0.10, 0.74, leaf, sx=0.9, sy=0.9, sz=0.80))
    return _join(parts)


def build_bush_round():
    """Buisson arrondi — 3 sphères proches du sol."""
    twig = _mat("twig", (0.40, 0.28, 0.16))
    leaf = _mat("leaf", (0.28, 0.54, 0.26))
    parts = []
    parts.append(_cyl("base", 0.04, 0.10, 0.05, twig))
    for i, (dx, dy, r) in enumerate([(0.0, 0.0, 0.24), (-0.15, 0.08, 0.18), (0.13, -0.09, 0.16)]):
        parts.append(_sphere(f"b{i}", r, dx, dy, 0.22 + i * 0.04, leaf, sx=1.0, sy=1.0, sz=0.80))
    return _join(parts)


def build_bush_flower():
    """Buisson fleuri."""
    twig   = _mat("twig",   (0.40, 0.28, 0.16))
    leaf   = _mat("leaf",   (0.30, 0.56, 0.28))
    flower = _mat("flower", (0.82, 0.42, 0.58))
    parts = []
    parts.append(_cyl("base", 0.04, 0.10, 0.05, twig))
    parts.append(_sphere("body", 0.24, 0.0, 0.0, 0.22, leaf, sx=1.1, sy=1.1, sz=0.85))
    for dx, dy in [(0.12, 0.06), (-0.10, -0.05), (0.04, -0.12)]:
        parts.append(_sphere("fl", 0.06, dx, dy, 0.30, flower))
    return _join(parts)


def build_bush_hedge():
    """Haie basse — 3 dômes alignés."""
    leaf = _mat("leaf", (0.24, 0.50, 0.24))
    parts = []
    for i, (dx, dy) in enumerate([(-0.24, 0.0), (0.0, 0.0), (0.24, 0.0)]):
        parts.append(_sphere(f"h{i}", 0.22, dx, dy, 0.16, leaf, sx=1.1, sy=1.1, sz=0.68))
    return _join(parts)


TREES = [
    ("tree_olive", build_olive),
    ("tree_cypress", build_cypress),
    ("tree_pine", build_pine),
    ("tree_umbrella", build_umbrella_pine),
    ("tree_fig", build_fig),
]

BUSHES = [
    ("bush_round", build_bush_round),
    ("bush_flower", build_bush_flower),
    ("bush_hedge", build_bush_hedge),
]


def _setup_render():
    sc = bpy.context.scene
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            sc.render.engine = engine
            break
        except TypeError:
            continue
    # Couleurs plates (Emission) — pas besoin de lumières complexes
    sc.render.resolution_x = RENDER_SIZE
    sc.render.resolution_y = RENDER_SIZE
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.compression = 15
    if hasattr(sc.eevee, "taa_render_samples"):
        sc.eevee.taa_render_samples = 32


def _setup_lights():
    for obj in list(bpy.data.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.light_add(type="SUN", location=(6, 10, 4))
    sun = bpy.context.active_object
    sun.data.energy = 2.4
    sun.data.color = (1.0, 0.96, 0.88)
    sun.rotation_euler = (math.radians(55), math.radians(8), math.radians(25))

    bpy.ops.object.light_add(type="SUN", location=(-4, 6, -3))
    fill = bpy.context.active_object
    fill.data.energy = 0.55
    fill.data.color = (0.85, 0.92, 1.0)
    fill.rotation_euler = (math.radians(60), 0, math.radians(-140))


def _setup_camera():
    for obj in list(bpy.data.objects):
        if obj.type == "CAMERA":
            bpy.data.objects.remove(obj, do_unlink=True)
    cam_data = bpy.data.cameras.new("NatureCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.8
    cam = bpy.data.objects.new("NatureCam", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    # Blender Z-up : x=droite, y=profondeur, z=hauteur
    x = CAM_DIST * math.cos(ISO_V) * math.sin(ISO_H)
    y = -CAM_DIST * math.cos(ISO_V) * math.cos(ISO_H)  # négatif = devant la scène
    z = CAM_DIST * math.sin(ISO_V)
    cam.location = (x, y, z)
    target = Vector((0.0, 0.0, 0.5))  # regarder légèrement au-dessus du sol
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def _frame_camera(cam, obj, padding=1.32):
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    cz = (min(zs) + max(zs)) / 2
    # Taille visible depuis la caméra iso
    span_x = max(xs) - min(xs)
    span_y = max(ys) - min(ys)
    span_z = max(zs) - min(zs)
    size = max(span_x + span_y * 0.6, span_z * 1.1)
    cam.data.ortho_scale = max(1.2, size * padding)
    target = Vector((cx, cy, cz))
    cam.location = Vector((
        cx + CAM_DIST * math.cos(ISO_V) * math.sin(ISO_H),
        cy - CAM_DIST * math.cos(ISO_V) * math.cos(ISO_H),
        cz + CAM_DIST * math.sin(ISO_V),
    ))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _render(filepath: str, obj, cam):
    _frame_camera(cam, obj)
    bpy.context.scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)


def main():
    _ensure_out()
    _setup_render()
    _setup_lights()
    cam = _setup_camera()

    print(f"[blender_export_nature] sortie : {OUT_RAW}")
    for name, builder in TREES + BUSHES:
        _clear_scene()
        obj = builder()
        out = os.path.join(OUT_RAW, f"{name}.png")
        _render(out, obj, cam)
        print(f"  OK {name}.png")

    print("[blender_export_nature] terminé — lance postprocess_generated_nature.py")


if __name__ == "__main__":
    main()
