#!/usr/bin/env python3

import argparse
import json

def obj_to_dict(obj_file):
    vertices = []
    indices = []
    for line in obj_file:
        data = line.strip().split('#', 1)[0].split()
        if not data: continue
        if data[0] == 'v':
            if len(data) != 4:
                raise ValueError('All vertices must be 3D, at least one vertex is {}D'.format(len(data)-1))
            vertices.extend(float(v) for v in data[1:])
        elif data[0] == 'f':
            if len(data) != 4:
                raise ValueError('All faces must be triangles, at least one face has {} vertices'.format(len(data)-1))
            for vertex in data[1:]:
                slash = vertex.find('/')
                if slash != -1: vertex = vertex[:slash]
                indices.append(int(vertex)-1)
    return {"vertices": vertices, "indices": indices}

def main():
    parser = argparse.ArgumentParser(description='Convert 3D model from OBJ to JSON\nVery simple! No support for texture coordinates, normals, materials, and any other OBJ things')
    parser.add_argument('obj', type=argparse.FileType('r'), help='OBJ file to read')
    parser.add_argument('json', type=argparse.FileType('w'), help='JSON file to write to')
    args = parser.parse_args()
    json.dump(obj_to_dict(args.obj), args.json)

if __name__ == "__main__":
    main()