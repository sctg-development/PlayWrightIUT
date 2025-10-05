#!/usr/bin/env python3
# Copyright (c) 2025 Ronan Le Meillat - SCTG Development
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

"""
Script to generate qrcodes.ts with individual exports from SVG files.
This script processes SVG files, converts nested SVG elements with positioning
attributes (x, y) into <g> groups with transform attributes, and generates
TypeScript export statements for each QR code SVG.
"""

# Import necessary modules
import os  # For file system operations like listing directories and joining paths
import re  # For regular expressions, used to parse viewBox attributes
import xml.etree.ElementTree as ET  # For parsing and manipulating XML/SVG files

# Register namespaces to ensure SVG elements are properly namespaced without prefixes
ET.register_namespace('', 'http://www.w3.org/2000/svg')  # Default SVG namespace
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')  # For xlink attributes if present

def process_svg_file(svg_file):
    """
    Process a single SVG file to convert nested SVG elements with x,y positioning
    into <g> groups with transform attributes.
    
    Args:
        svg_file (str): Path to the SVG file to process
        
    Returns:
        str: The processed SVG content as a string
    """
    # Read the entire SVG file content
    with open(svg_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Parse the SVG content into an XML tree structure
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        print(f"Error parsing {svg_file}")
        return content  # Return original content if parsing fails
    
    # Find all nested <svg> elements that have positioning attributes
    for svg_elem in root.findall('.//{http://www.w3.org/2000/svg}svg'):
        # Check if this SVG element has x and y attributes (positioning)
        if 'x' in svg_elem.attrib and 'y' in svg_elem.attrib:
            # Extract positioning and sizing information
            x = float(svg_elem.get('x', 0))  # X position
            y = float(svg_elem.get('y', 0))  # Y position
            width = svg_elem.get('width', '').replace('px', '')  # Width in pixels
            height = svg_elem.get('height', '').replace('px', '')  # Height in pixels
            viewBox = svg_elem.get('viewBox', '')  # ViewBox defining the coordinate system
            
            # Only process if we have all required attributes
            if width and height and viewBox:
                try:
                    # Parse the viewBox (expected format: "0 0 width height")
                    vb_match = re.match(r'0 0 (\d+) (\d+)', viewBox)
                    if vb_match:
                        vb_w = float(vb_match.group(1))  # ViewBox width
                        vb_h = float(vb_match.group(2))  # ViewBox height
                        width_num = float(width)  # Actual width
                        height_num = float(height)  # Actual height
                        
                        # Calculate scaling factors to maintain proper proportions
                        scale_x = width_num / vb_w
                        scale_y = height_num / vb_h
                        
                        # Convert the <svg> element to a <g> (group) element
                        svg_elem.tag = '{http://www.w3.org/2000/svg}g'
                        # Add transform attribute combining translation and scaling
                        svg_elem.attrib['transform'] = f'translate({x},{y}) scale({scale_x:.3f},{scale_y:.3f})'
                        
                        # Remove attributes that are no longer needed after conversion
                        for attr in ['x', 'y', 'width', 'height', 'viewBox', 'fill', 'overflow']:
                            svg_elem.attrib.pop(attr, None)
                        
                except ValueError:
                    # Skip this element if there are parsing errors
                    pass
    
    # Convert the modified XML tree back to a string
    content = ET.tostring(root, encoding='unicode')
    
    return content

def main():
    """
    Main function that orchestrates the processing of all SVG files
    and generates the TypeScript export file.
    """
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Define the output file path
    output_file = os.path.join(script_dir, 'qrcodes.ts')
    
    print("Generating qrcodes.ts from SVG files...")
    
    # Create and initialize the output file with a header comment
    with open(output_file, 'w') as f:
        f.write('''/**
 * QR code SVG exports generated from SVG files
 * Generated by generate-qrcodes-ts script
 */
''')
    
    # Process each SVG file in the directory
    for filename in os.listdir(script_dir):
        if filename.endswith('.svg'):
            # Build full path to the SVG file
            svg_file = os.path.join(script_dir, filename)
            # Extract group name by removing the .svg extension
            group_name = filename[:-4]
            
            print(f"Processing {group_name}...")
            
            # Process the SVG file
            svg_content = process_svg_file(svg_file)
            
            # Escape backticks in the SVG content (since it's used in template literals)
            svg_content = svg_content.replace('`', '\\`')
            
            # Append the export statement to the output file
            with open(output_file, 'a') as f:
                f.write(f'''
// {group_name} QR Code SVG
export const QRCode_{group_name} = `{svg_content}`;
''')
    
    print(f"Generated qrcodes.ts successfully! Output file: {output_file}")

# Execute the main function when the script is run directly
if __name__ == '__main__':
    main()