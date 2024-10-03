{
  description = "A Nix-flake-based Node.js development environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs = { self , nixpkgs ,... }: let
    forEachSystem = nixpkgs.lib.genAttrs [
      "aarch64-darwin"
      "aarch64-linux"
      "x86_64-darwin"
      "x86_64-linux"
    ];
  in {

    devShells = forEachSystem (system: {
      default = let
      pkgs = import nixpkgs {
        inherit system;
      };
      in pkgs.mkShell {
        packages = with pkgs; [
          nodejs_18
          nodePackages.pnpm
          (yarn.override { nodejs = nodejs_18; })
        ];
      };
    });
  };
}