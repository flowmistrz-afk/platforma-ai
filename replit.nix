{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.python311
    pkgs.python311Packages.pip
    pkgs.python311Packages.venvShellHook
    pkgs.stdenv.cc.cc.lib
    pkgs.docker
  ];
  
  venvDir = "venv";
}