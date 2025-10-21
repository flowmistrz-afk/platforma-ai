{ pkgs ? import <nixpkgs> {} }:

let
  python-with-pip = pkgs.python311.withPackages (ps: [
    ps.pip
  ]);
in
  pkgs.mkShell {
    buildInputs = [
      python-with-pip
      pkgs.pipx
      pkgs.docker
    ];
    
    # Ta zmienna środowiskowa sprawi, że `python` i `pip` z `python-with-pip`
    # będą dostępne bezpośrednio w terminalu.
    shellHook = ''
      export PATH="${python-with-pip}/bin:$PATH"
    '';
  }
