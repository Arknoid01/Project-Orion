#!/usr/bin/env python3
"""
Rend des assets .blend (arbres, buissons…) en sprites PNG transparents pour le jeu.

Manifeste : tools/nature_blend_manifest.json

Usage :
  blender --background --python tools/blender_render_blend_assets.py
  python tools/run_blender_nature.py --blends
"""

from __future__ import annotations

import json
import math
import os
import sys

try:
    import bpy
    from mathutils import Vector
except ImportError:
    print("Lance via Blender : python tools/run_blender_nature.py --blends")
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "tools", "nature_blend_manifest.json")
OUT_RAW = os.path.join(ROOT, "assets", "generated_nature", "raw")
RENDER_SIZE = 512

ISO_H = math.pi / 4
ISO_V = math.atan(1 / math.sqrt(2))
CAM_DIST = 14.0


def _load_manifest():
    if not os.path.isfile(MANIFEST):
        print(f"Manifeste introuvable : {MANIFEST}")
        sys.exit(1)
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)


def _setup_render(engine="workbench"):
    sc = bpy.context.scene
    if engine == "eevee":
        for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
            try:
                sc.render.engine = eng
                break
            except TypeError:
                continue
        if hasattr(sc, "eevee"):
            if hasattr(sc.eevee, "taa_render_samples"):
                sc.eevee.taa_render_samples = 16
            if hasattr(sc.eevee, "use_raytracing"):
                sc.eevee.use_raytracing = False
    else:
        sc.render.engine = "BLENDER_WORKBENCH"
        sc.display.shading.light = "FLAT"
        sc.display.shading.color_type = "MATERIAL"
    sc.render.resolution_x = RENDER_SIZE
    sc.render.resolution_y = RENDER_SIZE
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.compression = 15


def _clear_scene_keep_nothing():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def _hide_by_patterns(patterns):
    if not patterns:
        patterns = ["LOD1", "geometry_nodes"]
    for obj in bpy.data.objects:
        name = obj.name.lower()
        if obj.type in ("CAMERA", "LIGHT", "CURVE"):
            obj.hide_render = True
            obj.hide_viewport = True
            continue
        if any(p.lower() in name for p in patterns):
            obj.hide_render = True
            obj.hide_viewport = True


def _visible_meshes():
    return [o for o in bpy.data.objects if o.type == "MESH" and not o.hide_render]


def _mesh_bounds():
    meshes = _visible_meshes()
    if not meshes:
        return None
    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i, v in enumerate(w):
                mins[i] = min(mins[i], v)
                maxs[i] = max(maxs[i], v)
    cx = (mins[0] + maxs[0]) / 2
    cy = (mins[1] + maxs[1]) / 2
    cz = (mins[2] + maxs[2]) / 2
    span_x = maxs[0] - mins[0]
    span_y = maxs[1] - mins[1]
    span_z = maxs[2] - mins[2]
    size = max(span_x + span_y * 0.55, span_z * 1.05)
    return cx, cy, cz, size


def _recenter_visible_meshes():
    """Place le centre de la bbox au monde (0,0,0) pour un cadrage iso stable."""
    bounds = _mesh_bounds()
    if not bounds:
        return None
    cx, cy, cz, _ = bounds
    offset = Vector((-cx, -cy, -cz))
    for o in _visible_meshes():
        o.location += offset
    bpy.context.view_layer.update()
    return _mesh_bounds()


def _yaw_meshes_toward_camera(cam):
    """Tourne les billboards (herbe) pour qu'ils face la caméra iso."""
    to_cam = cam.location - Vector((0.0, 0.0, 0.0))
    if to_cam.length_squared < 1e-8:
        return
    yaw = math.atan2(to_cam.x, to_cam.y)
    for obj in _visible_meshes():
        obj.rotation_euler = (0.0, 0.0, yaw)
    bpy.context.view_layer.update()


def _setup_camera():
    for obj in list(bpy.data.objects):
        if obj.type == "CAMERA":
            bpy.data.objects.remove(obj, do_unlink=True)
    cam_data = bpy.data.cameras.new("NatureCam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("NatureCam", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def _frame_camera(cam, padding=1.25):
    bounds = _mesh_bounds()
    if not bounds:
        return
    cx, cy, cz, size = bounds
    cam.data.ortho_scale = max(1.0, size * padding)
    target = Vector((cx, cy, cz))
    cam.location = Vector((
        cx + CAM_DIST * math.cos(ISO_V) * math.sin(ISO_H),
        cy - CAM_DIST * math.cos(ISO_V) * math.cos(ISO_H),
        cz + CAM_DIST * math.sin(ISO_V),
    ))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _setup_lights(bounds_center):
    for obj in list(bpy.data.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    cx, cy, cz = bounds_center
    bpy.ops.object.light_add(type="SUN", location=(cx + 6, cy - 4, cz + 10))
    sun = bpy.context.active_object
    sun.data.energy = 2.8
    sun.data.color = (1.0, 0.96, 0.88)
    sun.rotation_euler = (math.radians(52), math.radians(10), math.radians(22))

    bpy.ops.object.light_add(type="SUN", location=(cx - 5, cy + 3, cz + 6))
    fill = bpy.context.active_object
    fill.data.energy = 0.7
    fill.data.color = (0.88, 0.94, 1.0)
    fill.rotation_euler = (math.radians(58), 0, math.radians(-130))


def _apply_scale(scale):
    if not scale or scale == 1.0:
        return
    for o in _visible_meshes():
        o.scale = (o.scale.x * scale, o.scale.y * scale, o.scale.z * scale)
    bpy.context.view_layer.update()


def _downscale_heavy_textures(max_size=1024):
    """Optionnel — désactivé par défaut (peut être lent sur packs 4K)."""
    pass


def _resolve_image_path(img_name, blend_path):
    """Cherche une texture à côté du .blend ou via le datablock Blender."""
    blend_dir = os.path.dirname(blend_path)
    img = bpy.data.images.get(img_name)
    candidates = []
    if img and img.filepath:
        candidates.append(bpy.path.abspath(img.filepath, basepath=blend_dir))
    stem = os.path.splitext(img_name)[0]
    candidates.extend([
        os.path.join(blend_dir, img_name),
        os.path.join(blend_dir, stem + ".png"),
        os.path.join(blend_dir, "textures", img_name),
        os.path.join(blend_dir, "texture", img_name),
    ])
    if img_name == "zassou1.png":
        candidates.insert(0, os.path.join(blend_dir, "zassou.png"))
    seen = set()
    for path in candidates:
        if not path or path in seen:
            continue
        seen.add(path)
        if os.path.isfile(path):
            return path
    return None


def _load_image(img_name, blend_path):
    path = _resolve_image_path(img_name, blend_path)
    if not path:
        return None
    img = bpy.data.images.get(img_name)
    if img is None:
        img = bpy.data.images.load(path, check_existing=True)
    else:
        img.filepath = path
        img.reload()
    if img.size[0] <= 0:
        return None
    return img


def _assign_image_material(obj, img):
    mat_name = f"SpriteExport_{obj.name}"
    mat = bpy.data.materials.get(mat_name) or bpy.data.materials.new(mat_name)
    mat.use_nodes = True
    if hasattr(mat, "blend_method"):
        mat.blend_method = "CLIP"
    if hasattr(mat, "shadow_method"):
        mat.shadow_method = "CLIP"
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    bsdf.inputs["Roughness"].default_value = 0.85
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if "Alpha" in tex.outputs and "Alpha" in bsdf.inputs:
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def _apply_texture_map(entry, sub, blend_path):
    tex_map = entry.get("texture_map") or {}
    if not tex_map and not sub.get("texture"):
        return True
    ok = True
    for obj in _visible_meshes():
        img_name = sub.get("texture") or tex_map.get(obj.name)
        if not img_name:
            continue
        img = _load_image(img_name, blend_path)
        if img is None:
            print(f"  WARN texture introuvable pour {obj.name}: {img_name}")
            ok = False
            continue
        _assign_image_material(obj, img)
    bpy.context.view_layer.update()
    return ok


def _mat_base_color(mat):
    if not mat or not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED" and "Base Color" in node.inputs:
            return list(node.inputs["Base Color"].default_value[:3])
        if node.type == "EMISSION" and "Color" in node.inputs:
            return list(node.inputs["Color"].default_value[:3])
    return None


def _set_mat_rgb(mat, rgb):
    if not mat or not mat.use_nodes or not rgb:
        return
    rgba = (float(rgb[0]), float(rgb[1]), float(rgb[2]), 1.0)
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED" and "Base Color" in node.inputs:
            node.inputs["Base Color"].default_value = rgba
        if node.type == "EMISSION" and "Color" in node.inputs:
            node.inputs["Color"].default_value = rgba


def _is_trunk_material(name):
    n = name.lower()
    return any(k in n for k in ("trunk", "bark", "wood", "stem"))


def _is_leaf_material(name):
    n = name.lower()
    return any(k in n for k in ("leaf", "leaves", "foliage", "canopy", "needle"))


def _snapshot_materials():
    snap = {}
    for mat in bpy.data.materials:
        c = _mat_base_color(mat)
        if c is not None:
            snap[mat.name] = c
    return snap


def _restore_materials(snap):
    for name, rgb in snap.items():
        mat = bpy.data.materials.get(name)
        if mat:
            _set_mat_rgb(mat, rgb)


def _apply_color_variant(trunk_rgb, leaf_rgb):
    for mat in bpy.data.materials:
        if trunk_rgb and _is_trunk_material(mat.name):
            _set_mat_rgb(mat, trunk_rgb)
        elif leaf_rgb and not _is_trunk_material(mat.name):
            _set_mat_rgb(mat, leaf_rgb)


def _render_to_file(out_name, cam, padding):
    if not out_name.endswith(".png"):
        out_name += ".png"
    out_path = os.path.join(OUT_RAW, out_name)
    os.makedirs(OUT_RAW, exist_ok=True)
    _frame_camera(cam, padding=padding)
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    print(f"  OK {out_name}")
    return True


def _matches_show_only(obj_name, patterns):
    if not patterns:
        return True
    n = obj_name.lower()
    for p in patterns:
        if n == p.lower():
            return True
    return False


def _isolate_meshes(show_only):
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        visible = _matches_show_only(obj.name, show_only)
        obj.hide_render = not visible
        obj.hide_viewport = not visible


def _render_asset(entry):
    blend_path = entry["blend"]
    if not os.path.isabs(blend_path):
        blend_path = os.path.join(ROOT, blend_path)
    if not os.path.isfile(blend_path):
        print(f"  SKIP {entry.get('output','?')} — fichier introuvable : {blend_path}")
        return False

    entries = entry.get("entries")
    if entries:
        ok_any = False
        for sub in entries:
            label = sub.get("output", "?")
            bpy.ops.wm.open_mainfile(filepath=blend_path)
            _setup_render(entry.get("engine", "workbench"))
            _hide_by_patterns(entry.get("hide", ["LOD1", "geometry_nodes"]))
            _apply_scale(entry.get("scale", 1.0))
            _isolate_meshes(sub.get("show_only", []))
            _apply_texture_map(entry, sub, blend_path)

            bounds = _recenter_visible_meshes()
            if not bounds:
                print(f"  SKIP {label} — aucun mesh visible")
                continue
            cx, cy, cz, _ = bounds
            _setup_lights((cx, cy, cz))
            cam = _setup_camera()
            if entry.get("billboard") or sub.get("billboard"):
                _yaw_meshes_toward_camera(cam)
                bounds = _recenter_visible_meshes()
                if not bounds:
                    print(f"  SKIP {label} — aucun mesh visible (billboard)")
                    continue
                cx, cy, cz, _ = bounds
                _setup_lights((cx, cy, cz))
                cam = _setup_camera()
            padding = sub.get("padding", entry.get("padding", 1.25))
            _restore_materials(_snapshot_materials())

            out_name = sub.get("output", "asset.png")
            if _render_to_file(out_name, cam, padding):
                ok_any = True
        return ok_any

    bpy.ops.wm.open_mainfile(filepath=blend_path)
    _setup_render(entry.get("engine", "workbench"))
    _hide_by_patterns(entry.get("hide", ["LOD1", "geometry_nodes"]))

    scale = entry.get("scale", 1.0)
    _apply_scale(scale)

    bounds = _recenter_visible_meshes()
    if not bounds:
        print(f"  SKIP {entry.get('output','?')} — aucun mesh visible")
        return False
    cx, cy, cz, _ = bounds
    _setup_lights((cx, cy, cz))
    cam = _setup_camera()
    padding = entry.get("padding", 1.25)

    mat_snap = _snapshot_materials()
    variants = entry.get("variants")
    if variants:
        # Un seul rendu — les couleurs sont appliquées au post-traitement (PIL)
        base_out = entry.get("base_output") or variants[0].get("output") or "tree_base.png"
        _restore_materials(mat_snap)
        return _render_to_file(base_out, cam, padding)

    out_name = entry.get("output", "asset.png")
    _restore_materials(mat_snap)
    return _render_to_file(out_name, cam, padding)


def main():
    data = _load_manifest()
    assets = data.get("assets", [])
    if not assets:
        print("Manifeste vide — ajoute des entrées dans nature_blend_manifest.json")
        sys.exit(1)

    print(f"[blender_render_blend_assets] {len(assets)} fichier(s) -> {OUT_RAW}")
    ok = 0
    for entry in assets:
        if _render_asset(entry):
            ok += 1

    print(f"[blender_render_blend_assets] terminé ({ok}/{len(assets)})")
    if ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
